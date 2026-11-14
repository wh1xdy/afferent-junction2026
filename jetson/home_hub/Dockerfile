# David's hub (hub/, demo/, contracts/, design/) as one WendyOS app. `wendy run` builds with this
# directory as the context, so ./deploy.sh copies those folders into stage/ first.
FROM python:3.12-slim

RUN useradd --system --uid 10001 --user-group --no-create-home --home-dir /nonexistent afferent

WORKDIR /srv/afferent
COPY stage/hub/requirements.txt hub/requirements.txt
COPY constraints.txt /tmp/constraints.txt
# pytest is only for the test suite; zeroconf finds the UNO Q and the data manager on the mesh
RUN grep -v '^pytest' hub/requirements.txt > /tmp/requirements.txt \
 && pip install --no-cache-dir -c /tmp/constraints.txt -r /tmp/requirements.txt zeroconf \
 && rm /tmp/requirements.txt /tmp/constraints.txt

COPY stage/ ./
COPY start.sh /usr/local/bin/afferent-home-hub
RUN chmod 0755 /usr/local/bin/afferent-home-hub && mkdir -p /data && chown afferent:afferent /data

ENV PYTHONUNBUFFERED=1 PYTHONDONTWRITEBYTECODE=1 AFFERENT_DB=/data/afferent.db
WORKDIR /srv/afferent/hub
EXPOSE 8000
CMD ["/usr/local/bin/afferent-home-hub"]
