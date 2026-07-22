import sys
import pydantic

from datetime import date
from typing import Optional

try:
    from pydantic import BaseModel
    
    class S(BaseModel):
        date: Optional[date] = None
        
    print("Testing '2026-07-07'")
    s1 = S(date='2026-07-07')
    print("Success:", s1.date)

    print("Testing '07-07-2026'")
    try:
        s2 = S(date='07-07-2026')
    except Exception as e:
        print("Failed:", e.errors())
        
except Exception as e:
    print(e)
