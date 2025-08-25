const fs = require('fs').promises;
const path = require('path');

// Load .env files with proper merging (parent first, then child overrides)
// Load parent .env first (if it exists)
const parentEnvPath = path.join(__dirname, '..', '.env');
if (require('fs').existsSync(parentEnvPath)) {
    require('dotenv').config({ path: parentEnvPath });
    console.log('Loaded parent .env file');
}

// Then load local .env (if it exists) - newer dotenv versions support override
const localEnvPath = path.join(__dirname, '.env');
if (require('fs').existsSync(localEnvPath)) {
    // For newer dotenv versions (16.1.0+)
    try {
        require('dotenv').config({ path: localEnvPath, override: true });
    } catch (error) {
        // Fallback for older dotenv versions
        require('dotenv').config({ path: localEnvPath });
    }
    console.log('Loaded local .env file');
}

class TrelicaLogPuller {
    constructor(config) {
        this.host = config.host || 'app.trelica.com';
        this.clientId = config.clientId;
        this.clientSecret = config.clientSecret;
        this.bookmarkFile = config.bookmarkFile || 'trelica_bookmark.json';
        this.outputFile = config.outputFile || 'trelica_logs.json';
        this.initialLookbackMonths = config.initialLookbackMonths || 3; // Default to 3 months
        this.accessToken = null;
        this.bookmark = null;
    }

    async authenticate() {
        const url = `https://${this.host}/connect/token`;
        const auth = Buffer.from(`${this.clientId}:${this.clientSecret}`).toString('base64');

        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Authorization': `Basic ${auth}`,
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: 'grant_type=client_credentials'
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(`Authentication failed: ${response.status} - ${error.error}`);
        }

        const data = await response.json();
        this.accessToken = data.access_token;
        console.log('Successfully authenticated');
    }

    async loadBookmark() {
        try {
            const bookmarkData = await fs.readFile(this.bookmarkFile, 'utf8');
            const bookmark = JSON.parse(bookmarkData);
            this.bookmark = bookmark.nextUrl;
            console.log(`Loaded bookmark: ${this.bookmark}`);
        } catch (error) {
            // File doesn't exist or is invalid, start from X months ago
            const lookbackDate = new Date();
            lookbackDate.setMonth(lookbackDate.getMonth() - this.initialLookbackMonths);
            const sinceParam = lookbackDate.toISOString();

            this.bookmark = `https://${this.host}/api/audit/v1/logs?limit=1000&since=${encodeURIComponent(sinceParam)}`;
            console.log(`No valid bookmark found, starting from ${this.initialLookbackMonths} months ago: ${sinceParam}`);
        }
    }

    async saveBookmark(nextUrl) {
        const bookmarkData = {
            nextUrl: nextUrl,
            lastUpdated: new Date().toISOString()
        };

        await fs.writeFile(this.bookmarkFile, JSON.stringify(bookmarkData, null, 2));
        this.bookmark = nextUrl;
        console.log(`Bookmark saved: ${nextUrl}`);
    }

    async fetchLogs() {
        if (!this.accessToken) {
            throw new Error('Not authenticated. Call authenticate() first.');
        }

        const response = await fetch(this.bookmark, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${this.accessToken}`,
                'Accept': 'application/json',
                'Content-Type': 'application/json'
            }
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(`Failed to fetch logs: ${response.status} - ${error.title || error.message}`);
        }

        return await response.json();
    }

    async appendLogsToFile(logs) {
        if (!logs || logs.length === 0) {
            return;
        }

        // Read existing logs if file exists
        let existingLogs = [];
        try {
            const existingData = await fs.readFile(this.outputFile, 'utf8');
            existingLogs = JSON.parse(existingData);
        } catch (error) {
            // File doesn't exist, start with empty array
        }

        // Append new logs
        const allLogs = existingLogs.concat(logs);

        // Write back to file
        await fs.writeFile(this.outputFile, JSON.stringify(allLogs, null, 2));
        console.log(`Appended ${logs.length} logs to ${this.outputFile}`);
    }

    async pullLogs() {
        try {
            console.log('Starting log pull process...');

            // Authenticate
            await this.authenticate();

            // Load bookmark to resume from last position
            await this.loadBookmark();

            let totalLogsPulled = 0;
            let hasMore = true;

            while (hasMore) {
                console.log(`Fetching logs...`);

                const response = await this.fetchLogs();
                const logs = response.results || [];

                console.log(`Fetched ${logs.length} logs`);

                if (logs.length > 0) {
                    await this.appendLogsToFile(logs);
                    totalLogsPulled += logs.length;
                    console.log(`Pulled ${logs.length} logs (total: ${totalLogsPulled})`);

                    // Update bookmark if we have a next URL and got data
                    if (response.next) {
                        await this.saveBookmark(response.next);
                    } else {
                        hasMore = false;
                        console.log('No next URL provided - reached end of available logs');
                    }
                } else {
                    // No logs returned - we've caught up to real-time
                    // Save the current URL as the bookmark for next run
                    hasMore = false;
                    console.log('No new logs found - caught up to real-time');

                    // Save the current bookmark so we can resume from here
                    const bookmarkData = {
                        nextUrl: this.bookmark,
                        lastUpdated: new Date().toISOString(),
                        note: "Caught up to real-time - no new logs available"
                    };
                    await fs.writeFile(this.bookmarkFile, JSON.stringify(bookmarkData, null, 2));
                    console.log(`Saved current position for next run: ${this.bookmark}`);
                }

                // Add a small delay to be respectful to the API
                await new Promise(resolve => setTimeout(resolve, 100));
            }

            console.log(`Log pull completed. Total logs pulled: ${totalLogsPulled}`);

        } catch (error) {
            console.error('Error during log pull:', error.message);
            throw error;
        }
    }
}

// Usage example
async function main() {
    const config = {
        host: process.env.TRELICA_HOST || 'app.trelica.com',
        clientId: process.env.TRELICA_CLIENT_ID,
        clientSecret: process.env.TRELICA_CLIENT_SECRET,
        bookmarkFile: process.env.BOOKMARK_FILE || 'trelica_bookmark.json',
        outputFile: process.env.OUTPUT_FILE || 'trelica_audit_logs.json',
        initialLookbackMonths: parseInt(process.env.INITIAL_LOOKBACK_MONTHS) || 3
    };

    // Validate required environment variables
    if (!config.clientId || !config.clientSecret) {
        console.error('Error: TRELICA_CLIENT_ID and TRELICA_CLIENT_SECRET environment variables are required');
        console.error('Please create a .env file with your credentials');
        process.exit(1);
    }

    const logPuller = new TrelicaLogPuller(config);

    try {
        await logPuller.pullLogs();
    } catch (error) {
        console.error('Log pull failed:', error.message);
        process.exit(1);
    }
}

// Run if this file is executed directly
if (require.main === module) {
    main();
}

module.exports = TrelicaLogPuller;