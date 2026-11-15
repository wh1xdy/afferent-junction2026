# The home hub's LAN door (door.py): one small Python process with host networking, no hub code in it.
FROM python:3.12-slim

RUN useradd --system --uid 10002 --user-group --no-create-home --home-dir /nonexistent door \
 && pip install --no-cache-dir zeroconf==0.154.0 ifaddr==0.2.0

COPY door.py /srv/door/door.py
ENV PYTHONUNBUFFERED=1 PYTHONDONTWRITEBYTECODE=1
USER door
WORKDIR /srv/door
EXPOSE 8800
CMD ["python", "/srv/door/door.py"]
