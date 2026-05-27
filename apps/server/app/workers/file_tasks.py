from app.workers.celery_app import celery_app


@celery_app.task(name="file.parse")
def parse_file(file_id: str) -> dict:
    return {"fileId": file_id, "status": "queued"}

