from app.g2p import hindi_phonemes


def test_hindi_g2p_handles_matras_and_virama():
    assert hindi_phonemes("कम") == ["k", "ə", "m"]
    assert hindi_phonemes("कृ") == ["k", "rɪ"]
    assert hindi_phonemes("क्त") == ["k", "t"]
