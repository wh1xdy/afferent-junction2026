FROM python:3.12-slim

WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app.py store.py stats.py catalog.py timeutil.py network.py openapi.py ./

ENV PYTHONUNBUFFERED=1 DATA_DIR=/data PORT=8100
EXPOSE 8100
CMD ["python3", "app.py"]
