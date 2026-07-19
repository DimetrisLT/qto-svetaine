#!/bin/bash
# MySQL atsarginė kopija – įdėkite į cron: 0 3 * * * /opt/qto/deploy/backup.sh
set -e
BACKUP_DIR=/opt/qto-backups
mkdir -p "$BACKUP_DIR"
DBPASS=$(grep '^DB_ROOT_PASSWORD=' "$(dirname "$0")/../.env" | cut -d= -f2)
FILE="$BACKUP_DIR/qto-$(date +%Y%m%d-%H%M).sql.gz"
docker exec $(docker ps -qf "name=db") mysqldump -uroot -p"$DBPASS" qto | gzip > "$FILE"
# Laikome tik paskutines 14 kopijų
ls -t "$BACKUP_DIR"/qto-*.sql.gz | tail -n +15 | xargs -r rm
echo "✓ $FILE"
