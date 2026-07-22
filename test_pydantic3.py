import sys
from datetime import date as dt_date
from typing import Optional
from pydantic import BaseModel

class S(BaseModel):
    date: Optional[dt_date] = None

print("Testing '2026-07-07'")
try:
    s1 = S(date='2026-07-07')
    print("Success:", s1.date)
except Exception as e:
    print(e)
