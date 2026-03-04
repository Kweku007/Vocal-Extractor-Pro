import sys
import json
import numpy as np
import librosa

KEYS = ["C", "Db", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"]
MINOR_KEYS = ["Cm", "C#m", "Dm", "D#m", "Em", "Fm", "F#m", "Gm", "G#m", "Am", "Bbm", "Bm"]

MAJOR_PROFILE = np.array([6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88])
MINOR_PROFILE = np.array([6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17])

def detect_key(audio_path):
    y, sr = librosa.load(audio_path, sr=22050, mono=True, duration=60)

    chromagram = librosa.feature.chroma_cqt(y=y, sr=sr, hop_length=2048, n_chroma=12)
    chroma_vals = np.mean(chromagram, axis=1)

    best_corr = -np.inf
    best_key = 0
    best_mode = "major"

    for shift in range(12):
        rotated = np.roll(chroma_vals, -shift)
        corr_maj = np.corrcoef(rotated, MAJOR_PROFILE)[0, 1]
        corr_min = np.corrcoef(rotated, MINOR_PROFILE)[0, 1]

        if corr_maj > best_corr:
            best_corr = corr_maj
            best_key = shift
            best_mode = "major"
        if corr_min > best_corr:
            best_corr = corr_min
            best_key = shift
            best_mode = "minor"

    if best_mode == "major":
        major_key = KEYS[best_key]
        minor_idx = (best_key - 3) % 12
        minor_key = MINOR_KEYS[minor_idx]
    else:
        minor_key = MINOR_KEYS[best_key]
        major_idx = (best_key + 3) % 12
        major_key = KEYS[major_idx]

    result = {
        "major": major_key,
        "minor": minor_key,
        "mode": best_mode,
        "correlation": float(best_corr)
    }
    print(json.dumps(result))

if __name__ == "__main__":
    detect_key(sys.argv[1])
