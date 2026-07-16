#!/bin/bash
cd /workspace/project/micro-erp/server
rm -f erp.db
exec node server.js
