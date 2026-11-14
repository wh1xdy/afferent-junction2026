FROM python:3.12-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY app.py network.py ble.py data_manager_client.py data_manager_push.py ./
CMD ["python", "-u", "app.py"]
