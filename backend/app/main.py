from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from .demo_data import DEMO_SONGS

app = FastAPI(title="歌里有我 Demo")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/api/songs")
def list_songs() -> list[dict]:
    return DEMO_SONGS


@app.get("/api/songs/{song_id}")
def get_song(song_id: int) -> dict:
    song = next((item for item in DEMO_SONGS if item["id"] == song_id), None)
    if song is None:
        raise HTTPException(status_code=404, detail="找不到这首演示歌曲")
    return song
