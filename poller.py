"""SubLedger poller — polls Supabase jobs and processes uploaded documents."""

import io
import json
import os
import time
import traceback
from datetime import datetime, timezone

import requests

import processor

SUPABASE_URL = os.environ.get("SUPABASE_URL", "").rstrip("/")
SUPABASE_SERVICE_KEY = os.environ.get("SUPABASE_SERVICE_KEY", "")
PRODUCT_ID = os.environ.get("PRODUCT_ID", "")
ANTHROPIC_API_KEY = os.environ.get("ANTHROPIC_API_KEY", "")

REST_URL = f"{SUPABASE_URL}/rest/v1"
NOTIFICATIONS_URL = "https://njyvnmczoydsaewvfhyq.supabase.co/rest/v1/notifications"

SB_HEADERS = {
    "apikey": SUPABASE_SERVICE_KEY,
    "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}",
}


def download_file(bucket, file_path):
    if file_path.startswith(bucket + "/"):
        file_path = file_path[len(bucket) + 1:]
    url = f"{SUPABASE_URL}/storage/v1/object/{bucket}/{file_path}"
    resp = requests.get(url, headers={"Authorization": f"Bearer {SUPABASE_SERVICE_KEY}", "apikey": SUPABASE_SERVICE_KEY})
    resp.raise_for_status()
    return resp.content


def upload_file(bucket, file_path, data, content_type="application/octet-stream"):
    url = f"{SUPABASE_URL}/storage/v1/object/{bucket}/{file_path}"
    resp = requests.post(
        url,
        headers={
            "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}",
            "apikey": SUPABASE_SERVICE_KEY,
            "Content-Type": content_type,
            "x-upsert": "true",
        },
        data=data,
    )
    if resp.status_code >= 400:
        print(f"upload_file failed {resp.status_code}: {resp.text}")
    return resp


def fetch_pending_jobs():
    url = (
        f"{REST_URL}/jobs?status=eq.pending&job_type=eq.process_upload"
        f"&product_id=eq.{PRODUCT_ID}&order=created_at.asc&limit=5"
    )
    resp = requests.get(url, headers=SB_HEADERS)
    resp.raise_for_status()
    return resp.json()


def update_job(job_id, payload):
    url = f"{REST_URL}/jobs?id=eq.{job_id}"
    headers = {**SB_HEADERS, "Content-Type": "application/json", "Prefer": "return=minimal"}
    resp = requests.patch(url, headers=headers, json=payload)
    if resp.status_code >= 400:
        print(f"update_job failed {resp.status_code}: {resp.text}")
    return resp


def insert_record(product_id, customer_id, record, source_file_path):
    url = f"{REST_URL}/records"
    headers = {**SB_HEADERS, "Content-Type": "application/json", "Prefer": "return=minimal"}
    resp = requests.post(
        url,
        headers=headers,
        json={
            "product_id": product_id,
            "customer_id": customer_id,
            "title": record["title"],
            "status": record["status"],
            "details": record["details"],
            "source_file_path": source_file_path,
            "due_date": record.get("due_date"),
        },
    )
    if resp.status_code >= 400:
        print(f"insert_record failed {resp.status_code}: {resp.text}")
    return resp


def send_notification(product_id, customer_id, title, body, notif_type):
    try:
        payload = {
            "product_id": product_id,
            "customer_id": customer_id,
            "title": title,
            "body": body,
            "type": notif_type,
            "read": False,
        }
        resp = requests.post(
            NOTIFICATIONS_URL,
            headers={**SB_HEADERS, "Content-Type": "application/json", "Prefer": "return=minimal"},
            json=payload,
        )
        if resp.status_code >= 400:
            print(f"notification failed {resp.status_code}: {resp.text}")
    except Exception as exc:
        print(f"notification error (ignored): {exc}")


def process_job(job):
    job_id = job.get("id")
    customer_id = job.get("customer_id")
    input_file_path = job.get("input_file_path")
    print(f"processing job {job_id} for customer {customer_id}")

    try:
        file_bytes = download_file("uploads", input_file_path)
    except Exception as exc:
        print(f"download failed: {exc}")
        update_job(job_id, {
            "status": "failed",
            "result_summary": f"Download failed: {exc}",
            "completed_at": datetime.now(timezone.utc).isoformat(),
        })
        send_notification(PRODUCT_ID, customer_id, "Processing failed", "There was an error processing your upload.", "error")
        return

    try:
        records = processor.process_file(file_bytes)
    except Exception as exc:
        traceback.print_exc()
        update_job(job_id, {
            "status": "failed",
            "result_summary": f"Processing failed: {exc}",
            "completed_at": datetime.now(timezone.utc).isoformat(),
        })
        send_notification(PRODUCT_ID, customer_id, "Processing failed", "There was an error processing your upload.", "error")
        return

    base_name = os.path.basename(input_file_path or f"job-{job_id}")
    output_path = f"{PRODUCT_ID}/{job_id}/result-{base_name}.json"

    result_payload = json.dumps(records, indent=2, default=str).encode("utf-8")
    upload_file("results", output_path, result_payload, "application/json")

    for record in records:
        insert_record(PRODUCT_ID, customer_id, record, input_file_path)

    summary = f"Extracted {len(records)} record(s) from {base_name}"
    update_job(job_id, {
        "status": "completed",
        "output_file_path": output_path,
        "result_summary": summary,
        "completed_at": datetime.now(timezone.utc).isoformat(),
    })
    send_notification(PRODUCT_ID, customer_id, "Processing complete", "Your upload has been processed successfully.", "success")
    print(f"job {job_id} completed: {summary}")


def poll():
    while True:
        try:
            jobs = fetch_pending_jobs()
            for job in jobs:
                process_job(job)
        except Exception as exc:
            print(f"poll error: {exc}")
        time.sleep(60)


if __name__ == "__main__":
    print("Poller started")
    poll()
