#!/bin/bash
# Kill any processes running on the development ports
lsof -ti :3001 | xargs kill -9 2>/dev/null
lsof -ti :5173 | xargs kill -9 2>/dev/null 