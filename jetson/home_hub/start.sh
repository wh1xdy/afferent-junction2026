#!/bin/sh
# Container entry point: the volume /data may hold files an earlier (root) image wrote, so it is
# handed to the user afferent (uid 10001) first; the hub itself never runs as root.
set -eu
chown -R 10001:10001 /data
exec setpriv --reuid=10001 --regid=10001 --clear-groups --no-new-privs \
  python -m uvicorn afferent_hub.home:create_home_app --factory --host 0.0.0.0 --port 8000
