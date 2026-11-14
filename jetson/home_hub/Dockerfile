# David's hub (hub/, demo/, contracts/, design/) as one WendyOS app. `wendy run` builds with this
# directory as the context, so ./deploy.sh copies those folders into stage/ first.
FROM python:3.12-slim

WORKDIR /srv/afferent
COPY stage/hub/requirements.txt hub/requirements.txt
# pytest is only for the test suite; zeroconf finds the UNO Q on the mesh (AFFERENT_BEDSIDE=unoq:auto)
RUN grep -v '^pytest' hub/requirements.txt > /tmp/requirements.txt \
 && pip install --no-cache-dir -r /tmp/requirements.txt zeroconf==0.154.0 \
 && rm /tmp/requirements.txt

COPY stage/ ./

ENV PYTHONUNBUFFERED=1 PYTHONDONTWRITEBYTECODE=1 AFFERENT_DB=/data/afferent.db
WORKDIR /srv/afferent/hub
EXPOSE 8000
CMD ["python", "-m", "uvicorn", "afferent_hub.home:create_home_app", "--factory", "--host", "0.0.0.0", "--port", "8000"]
