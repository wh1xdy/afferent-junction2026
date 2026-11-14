FROM python:3.12-slim
WORKDIR /app
RUN pip install --no-cache-dir zeroconf==0.154.0
COPY app.py store.py report.py network.py ./
ENV PYTHONUNBUFFERED=1 AFFERENT_DB=/data/afferent.db PORT=8090
CMD ["python", "-u", "app.py"]
