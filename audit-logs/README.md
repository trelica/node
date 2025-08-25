# Trelica Audit Log Puller

A Node.js script that pulls audit logs from the Trelica API with intelligent bookmark-based incremental syncing.

## Features

-   **Incremental Sync**: Automatically resumes from where it left off using bookmark persistence
-   **Smart Initial Pull**: On first run, fetches logs from the last 3 months (configurable)
-   **Real-time Ready**: Stops when caught up and resumes from the right position on next run
-   **Flexible Configuration**: Environment variable based configuration with parent/child .env merging
-   **Error Handling**: Robust authentication and API error handling
-   **Rate Limiting**: Built-in delays to be respectful to the Trelica API

## Quick Start

1. **Install dependencies**

    ```bash
    yarn install
    ```

2. **Configure environment variables**

    Create a `.env` file:

    ```bash
    TRELICA_CLIENT_ID=your_client_id_here
    TRELICA_CLIENT_SECRET=your_client_secret_here
    ```

3. **Run the script**
    ```bash
    yarn start
    ```

## Configuration

### Environment Variables

| Variable                  | Required | Default                   | Description                                                  |
| ------------------------- | -------- | ------------------------- | ------------------------------------------------------------ |
| `TRELICA_CLIENT_ID`       | ✅       | -                         | Your Trelica API client ID                                   |
| `TRELICA_CLIENT_SECRET`   | ✅       | -                         | Your Trelica API client secret                               |
| `TRELICA_HOST`            | ❌       | `app.trelica.com`         | Trelica API host (use `dev.trelica.com` for dev environment) |
| `INITIAL_LOOKBACK_MONTHS` | ❌       | `3`                       | How many months back to fetch on first run                   |
| `BOOKMARK_FILE`           | ❌       | `trelica_bookmark.json`   | File to store sync position                                  |
| `OUTPUT_FILE`             | ❌       | `trelica_audit_logs.json` | File to store collected logs                                 |

### Example .env file

```bash
# Required
TRELICA_CLIENT_ID=abc123def456
TRELICA_CLIENT_SECRET=supersecretkey789

# Optional
TRELICA_HOST=app.trelica.com
INITIAL_LOOKBACK_MONTHS=1
OUTPUT_FILE=my_audit_logs.json
```

### Multi-environment Setup

The script supports `.env` file inheritance - you can have shared settings in a parent directory and overrides in the project folder:

```
node/
├── .env                    # Shared settings
├── audit-logs/
│   ├── .env               # Local overrides
│   ├── package.json
│   └── index.js
```

## How It Works

### First Run

-   Authenticates with Trelica API using client credentials OAuth2 flow
-   Starts pulling logs from N months ago (configurable via `INITIAL_LOOKBACK_MONTHS`)
-   Paginates through all available logs until caught up to real-time
-   Saves bookmark position to resume from next time

### Subsequent Runs

-   Loads bookmark from previous run
-   Resumes pulling logs from exact position where it left off
-   Only fetches new logs since last run
-   Updates bookmark as it progresses

### API Pagination

The script handles Trelica's pagination automatically:

-   Uses the `next` URL provided in API responses
-   Stops when no new logs are returned (caught up to real-time)
-   Saves the current position for next run

## Output

### Log Files

-   **Audit logs**: Saved to `OUTPUT_FILE` (default: `trelica_audit_logs.json`)
-   **Bookmark**: Sync position saved to `BOOKMARK_FILE` (default: `trelica_bookmark.json`)

### Console Output

```
Loaded parent .env file
Loaded local .env file
Starting log pull process...
Successfully authenticated
Loaded bookmark: https://app.trelica.com/api/audit/v1/logs?after=ABC123...
Fetching logs from: https://app.trelica.com/api/audit/v1/logs?after=ABC123...
Fetched 150 logs
Pulled 150 logs (total: 150)
No new logs found - caught up to real-time
Saved current position for next run
Log pull completed. Total logs pulled: 150
```

## Scheduling

For automated log collection, you can schedule the script using:

### Cron (Linux/Mac)

```bash
# Run every 15 minutes
*/15 * * * * cd /path/to/audit-logs && yarn start

# Run every hour
0 * * * * cd /path/to/audit-logs && yarn start
```

### Task Scheduler (Windows)

Create a scheduled task that runs:

```
cd C:\path\to\audit-logs && yarn start
```

### Docker

```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package.json yarn.lock ./
RUN yarn install --frozen-lockfile
COPY . .
CMD ["yarn", "start"]
```

## API Authentication

This script uses Trelica's client credentials OAuth2 flow:

1. Exchanges client ID/secret for access token
2. Uses Bearer token for API requests
3. Automatically handles token refresh (tokens are short-lived)

To get your API credentials:

1. Log into Trelica
2. Go to Settings → API
3. Create new API credentials
4. Copy the Client ID and Secret

## Troubleshooting

### Common Issues

**Authentication Failed**

-   Verify your `TRELICA_CLIENT_ID` and `TRELICA_CLIENT_SECRET`
-   Check that your API credentials have audit log access permissions
-   Ensure you're using the correct `TRELICA_HOST` (dev vs production)

**No Logs Returned**

-   Check if there are actually audit events in your Trelica instance
-   Verify the `INITIAL_LOOKBACK_MONTHS` setting isn't too restrictive
-   Check the date range - you might be looking too far back

**File Permission Errors**

-   Ensure the script has write permissions to create bookmark and log files
-   Check disk space availability

### Debug Mode

To see more detailed output, you can modify the script to add more logging or check the bookmark file contents:

```bash
cat trelica_bookmark.json
```

Example bookmark file:

```json
{
    "nextUrl": "https://app.trelica.com/api/audit/v1/logs?after=BAAAAGeEFwEAAAAAbiT2hKN43Ag%3d&limit=1000",
    "lastUpdated": "2025-08-25T10:30:45.123Z",
    "note": "Caught up to real-time - no new logs available"
}
```

## License

MIT License - feel free to modify and distribute as needed.

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request
