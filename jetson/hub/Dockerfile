# The hub alone: Python's standard library + zeroconf (finds the UNO Q on the mesh).
# No language model is in the image and none is started.
# python:3.12-slim (3.12.16, Debian trixie), pinned by its multi-arch index digest like the image before it
FROM python:3.12-slim@sha256:5e2bdb1b0d542d5039cffb8181c65930093949194a65c365dfb1b0fe13a4fa5b
RUN pip install --no-cache-dir zeroconf==0.154.0
WORKDIR /hub
COPY app.py auth.py store.py report.py grounding.py demo.py fhir.py network.py ./
ENV PYTHONUNBUFFERED=1 AFFERENT_DB=/data/afferent.db PORT=8090
ENTRYPOINT ["python3", "-u", "/hub/app.py"]
