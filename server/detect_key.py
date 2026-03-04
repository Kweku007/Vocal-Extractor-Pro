import sys
import json
import numpy as np
import librosa

KEYS = ["C", "Db", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"]
MINOR_KEYS = ["Cm", "C#m", "Dm", "D#m", "Em", "Fm", "F#m", "Gm", "G#m", "Am", "Bbm", "Bm"]

MAJOR_PROFILE = np.array([6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88])
MINOR_PROFILE = np.array([6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17])

TEMPERLEY_MAJOR = np.array([5.0, 2.0, 3.5, 2.0, 4.5, 4.0, 2.0, 4.5, 2.0, 3.5, 1.5, 4.0])
TEMPERLEY_MINOR = np.array([5.0, 2.0, 3.5, 4.5, 2.0, 4.0, 2.0, 4.5, 3.5, 2.0, 1.5, 4.0])

def ks_detect(chroma_vals, major_profile, minor_profile):
    best_corr = -np.inf
    best_key = 0
    best_mode = "major"

    for shift in range(12):
        rotated = np.roll(chroma_vals, -shift)
        corr_maj = np.corrcoef(rotated, major_profile)[0, 1]
        corr_min = np.corrcoef(rotated, minor_profile)[0, 1]

        if corr_maj > best_corr:
            best_corr = corr_maj
            best_key = shift
            best_mode = "major"
        if corr_min > best_corr:
            best_corr = corr_min
            best_key = shift
            best_mode = "minor"

    return best_key, best_mode, best_corr

def detect_key(audio_path):
    y, sr = librosa.load(audio_path, sr=22050, mono=True)

    y_harmonic = librosa.effects.harmonic(y, margin=8)

    chroma_cqt = librosa.feature.chroma_cqt(y=y_harmonic, sr=sr, hop_length=2048, n_chroma=12)
    chroma_stft = librosa.feature.chroma_stft(y=y_harmonic, sr=sr, hop_length=2048, n_chroma=12)
    chroma_cens = librosa.feature.chroma_cens(y=y_harmonic, sr=sr, hop_length=2048, n_chroma=12)

    votes = {}

    for name, chroma in [("cqt", chroma_cqt), ("stft", chroma_stft), ("cens", chroma_cens)]:
        chroma_vals = np.mean(chroma, axis=1)

        for pname, maj_p, min_p in [("ks", MAJOR_PROFILE, MINOR_PROFILE), ("temperley", TEMPERLEY_MAJOR, TEMPERLEY_MINOR)]:
            key_idx, mode, corr = ks_detect(chroma_vals, maj_p, min_p)
            label = f"{key_idx}_{mode}"
            if label not in votes:
                votes[label] = {"key": key_idx, "mode": mode, "score": 0, "max_corr": corr}
            votes[label]["score"] += corr
            votes[label]["max_corr"] = max(votes[label]["max_corr"], corr)

    best_label = max(votes, key=lambda k: votes[k]["score"])
    best = votes[best_label]
    best_key = best["key"]
    best_mode = best["mode"]
    best_corr = best["max_corr"]

    all_results = []
    for label, v in sorted(votes.items(), key=lambda x: -x[1]["score"]):
        k = KEYS[v["key"]] if v["mode"] == "major" else MINOR_KEYS[v["key"]]
        all_results.append(f"{k}({v['mode']})={v['score']:.3f}")
    sys.stderr.write(f"Key votes: {', '.join(all_results)}\n")

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
