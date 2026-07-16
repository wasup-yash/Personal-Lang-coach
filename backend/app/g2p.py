import re
from phonemizer import phonemize
from phonemizer.separator import Separator


CONSONANTS = {
    "क": "k", "ख": "kʰ", "ग": "g", "घ": "gʱ", "च": "tʃ", "छ": "tʃʰ", "ज": "dʒ", "झ": "dʒʱ", "ट": "ʈ", "ठ": "ʈʰ", "ड": "ɖ", "ढ": "ɖʱ",
    "त": "t̪", "थ": "t̪ʰ", "द": "d̪", "ध": "d̪ʱ", "न": "n", "प": "p", "फ": "pʰ", "ब": "b", "भ": "bʱ", "म": "m", "य": "j", "र": "r", "ल": "l", "व": "ʋ", "श": "ʃ", "ष": "ʂ", "स": "s", "ह": "ɦ",
}
INDEPENDENT_VOWELS = {"अ": "ə", "आ": "aː", "इ": "i", "ई": "iː", "उ": "u", "ऊ": "uː", "ए": "eː", "ऐ": "ɛː", "ओ": "oː", "औ": "ɔː"}
MATRAS = {"ा": "aː", "ि": "i", "ी": "iː", "ु": "u", "ू": "uː", "े": "eː", "ै": "ɛː", "ो": "oː", "ौ": "ɔː", "ृ": "rɪ"}
MARKS = {"ं": "̃", "ः": "h", "ँ": "̃"}
VIRAMA = "्"


def phonemes_for_word(word: str, language: str) -> list[str]:
    if language == "en":
        value = phonemize(word, language="en-us", backend="espeak", strip=True, njobs=1, separator=Separator(phone=" ", word=""))
        return [token for token in re.split(r"\s+", value.replace("ˈ", "").replace("ˌ", "")) if token]
    return hindi_phonemes(word)


def hindi_phonemes(word: str) -> list[str]:
    """Conservative Devanagari G2P baseline; Hindi GOP remains uncalibrated."""
    characters = list(word)
    phones: list[str] = []
    for index, character in enumerate(characters):
        next_character = characters[index + 1] if index + 1 < len(characters) else ""
        if character in CONSONANTS:
            phones.append(CONSONANTS[character])
            if next_character not in MATRAS and next_character != VIRAMA:
                phones.append("ə")
        elif character in INDEPENDENT_VOWELS:
            phones.append(INDEPENDENT_VOWELS[character])
        elif character in MATRAS:
            phones.append(MATRAS[character])
        elif character in MARKS:
            phones.append(MARKS[character])
    # A final inherent schwa is normally deleted in Hindi pronunciation.
    if phones and phones[-1] == "ə":
        phones.pop()
    if not phones:
        raise ValueError(f"No Hindi phonemes produced for {word!r}")
    return phones
