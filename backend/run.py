import uvicorn

if __name__ == "__main__":
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=5000,  # Match the port expected by frontend
        reload=True  # Auto-reload on code changes
    )

