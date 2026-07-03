FROM python:3.11-slim

COPY requirements.txt .
RUN pip install --upgrade pip setuptools wheel \
    && pip install --no-cache-dir -r requirements.txt

COPY app ./app
COPY main.py ./main.py
COPY config ./config
COPY frontend_dist ./frontend_dist
COPY alembic ./alembic
COPY alembic.ini ./alembic.ini
COPY start.sh ./start.sh
RUN sed -i 's/\r$//' ./start.sh && chmod +x ./start.sh

CMD ["./start.sh"]
