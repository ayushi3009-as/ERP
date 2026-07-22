import sys
from datetime import date
from typing import Optional
from pydantic import BaseModel

class S(BaseModel):
    my_date: Optional[date] = None

print("Testing '2026-07-07'")
try:
    s1 = S(my_date='2026-07-07')
    print("Success:", s1.my_date)
except Exception as e:
    print(e)
