// NOTE and CANVAS checks. In the app these live in the UI (ui/TaskActivity.kt note() and
// canvas(), ui/Views.kt DrawPad), not in core/Proof.kt; they are pulled out here as pure logic.
// Proof.kt's sensor checks (SquatCounter, PushupCounter, AscentMeter, ChoreGoal, TypingGoal,
// PhotoCheck) are phone-only and not ported (see PARITY.md).

/** Words in a note: Kotlin `s.split(Regex("\\s+")).count { it.isNotBlank() }`. */
export function countWords(text) {
  if (!text) return 0;
  return text.split(/\s+/).filter((w) => w.trim() !== '').length;
}

/**
 * Check.NOTE: at least `minWords` words in Kaak's notepad. The note is never saved: the page
 * clears it when Kaak "eats" it.
 */
export function noteOk(text, minWords) {
  return countWords(text) >= minWords;
}

/** "0 / 6 words", as the app's counter shows. */
export function noteProgress(text, minWords) {
  return `${countWords(text)} / ${minWords} words`;
}

/**
 * Check.CANVAS: a drawing pad that counts strokes (DrawPad). A stroke is a pointer down ... up.
 * Feed it pointerdown/pointerup (or touchstart/touchend); `onStroke(n)` fires on every finished stroke.
 */
export class StrokeCounter {
  #strokes = 0;
  #down = false;
  #onStroke;

  constructor(onStroke = null) {
    this.#onStroke = onStroke;
  }

  get strokes() { return this.#strokes; }

  down() { this.#down = true; }

  /** Returns the stroke count. A pointer-up without a pointer-down is ignored. */
  up() {
    if (!this.#down) return this.#strokes;
    this.#down = false;
    this.#strokes++;
    this.#onStroke?.(this.#strokes);
    return this.#strokes;
  }

  /** "Clear" button. */
  clear() {
    this.#down = false;
    this.#strokes = 0;
    this.#onStroke?.(0);
  }

  /** "Show Kaak" is enabled at this many strokes (Bribe.amount). */
  ok(minStrokes) {
    return this.#strokes >= minStrokes;
  }
}

export function canvasOk(strokes, minStrokes) {
  return strokes >= minStrokes;
}
