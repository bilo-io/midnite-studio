# MusicGen-melody as ONNX for `@huggingface/transformers`

Phase 101 Theme K spike. Date: 2026-10-09. Question: can Send to Generator condition
MusicGen on the song's melody, in the same worker that already runs MusicGen-small?

## Verdict

**No usable ONNX build exists, and the runtime cannot run the model even if one did.
Take the fallback branch: a rendered reference plus a deterministic text description.**

## What was checked

All of this is the Hugging Face hub API and the installed runtime, queried on 2026-10-09.

| Check | Result |
|---|---|
| `Xenova/` namespace, search `musicgen` | One repo: `Xenova/musicgen-small` (the one the worker loads) |
| `onnx-community/` namespace, search `musicgen` | None |
| Any repo tagged `onnx`, search `musicgen` | Small and medium re-uploads, `musicgen-tiny-jungle-onnx`, a tiny-random test model. **No melody variant** |
| Hub search `melody-onnx` | None |
| `facebook/musicgen-melody` files | PyTorch only: `model-0000{1,2}-of-00002.safetensors` (6.2 GB, fp32), `state_dict.bin`, `compression_state_dict.bin`. No `onnx/` folder |
| `@huggingface/transformers` 3.8.1 (installed) and 4.3.1 (latest) | Model types `musicgen` and `musicgen_decoder` only. `musicgen_melody` and `MusicgenMelody*` appear nowhere in either source tree |

So the weights are not exported and the library has no class to load them. The worker's
`MusicgenForConditionalGeneration.from_pretrained('Xenova/musicgen-small', ...)` has no
melody counterpart.

## Why a local export would not rescue it

- **Architecture differs.** `config.json` is `musicgen_melody`, `MusicgenMelodyForConditionalGeneration`:
  a 48-layer, 1536-wide decoder (about 1.56 B parameters, F32 per the hub's safetensors
  metadata) with a 12-bin chroma conditioning stream (`num_chroma`: 12, `chroma_length`: 235)
  concatenated with the T5 text states. Small is a 24-layer, 1024-wide decoder.
- **Preprocessing is Python-only.** Melody conditioning needs a chroma extractor
  (`MusicgenMelodyFeatureExtractor`: STFT, then chroma filter bank, argmax one-hot). Nothing
  of it exists in JS, so we would also hand-write and validate it against the reference.
- **We would own the export.** An ONNX export plus quantisation, hosting (Theme D's
  sample-hosting decision, but for gigabytes), and a transformers.js fork for the new model
  type. That is a project, not a Theme K checklist item.
- **Licence.** Same CC-BY-NC-4.0 as small; no change.

## Figures

Nothing could be measured: there is no model to load. Small's real sizes come from the hub
file listing; the melody rows are **estimates** scaled from small, marked as such.

| | `Xenova/musicgen-small` (shipped) | MusicGen-melody (if exported) |
|---|---|---|
| Download | **656 MB** measured from the hub listing: q8 text encoder 110 MB, q8 decoder 428 MB, fp32 EnCodec 118 MB (the worker's `AUDIO_LOCAL_MODEL_BYTES` says 660 MB) | **estimate about 1.9 GB** at q8 (1.5 B decoder at 1 byte per weight, about 1.6 GB, plus T5 text encoder and EnCodec). fp16 would be about 3.3 GB |
| RAM while rendering | about 2-3 GB (the runtime's own measured note) | **estimate 6-8 GB**: decoder is about 3.7x small's, and the KV cache scales with layers x width. Does not fit an 8 GB Mac alongside the OS and the app |
| Speed | 5 s of audio in 4.4 s idle, 1-5x slower than real time (runtime's own measurement) | **estimate 3-4x slower than small**, so roughly 4-20x slower than real time on CPU. A 30 s loop would take minutes |

The 8 GB Mac line is the deciding one: the estimate puts melody over the memory budget
before speed even matters. The estimate is deliberately rough; its direction is not in
doubt, because the parameter ratio alone is 3.7x.

## Recommendation for the build (Theme K, after B, C, J)

1. Keep the **Send to Generator** button. It renders the arrangement or loop region with
   Theme J's WAV export and hands Generator the file as a **reference**, shown and
   playable, not as model conditioning.
2. Generate the **text description deterministically from the song model**, no LLM: key
   (from the Theme B model's key signature, else a pitch-class histogram), tempo, time
   signature, instrumentation (GM program names), density and a mood word from a fixed
   lookup (mode plus tempo bands). It is appended to the prompt through the existing
   `prompt.ts` caption path, so MusicGen-small is unchanged.
3. Record the limitation in the UI: the generated music follows the description, not the
   notes. Say so in the button's tooltip.
4. Store the `songId` on the variant so it links back (checklist item 4).
5. If melody ever ships as ONNX plus a transformers.js model type, revisit: the conditioning
   hook would be a new `MusicEngine` method beside `render`, and the worker's
   `MODEL_DTYPE` table would gain a second model entry.
