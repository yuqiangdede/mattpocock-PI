//! Tolerant transcript views. Invalid bytes are omitted, never written back by reads.

use anyhow::Result;

pub(super) fn decode(bytes: Vec<u8>) -> Result<String> {
    let bytes = match String::from_utf8(bytes) {
        Ok(text) => return Ok(text),
        Err(error) => error.into_bytes(),
    };
    let mut remaining = bytes.as_slice();
    let mut text = String::with_capacity(bytes.len());
    let mut skipped = 0;
    while !remaining.is_empty() {
        match std::str::from_utf8(remaining) {
            Ok(valid) => {
                text.push_str(valid);
                break;
            }
            Err(error) => {
                let valid = error.valid_up_to();
                text.push_str(std::str::from_utf8(&remaining[..valid])?);
                let invalid = error.error_len().unwrap_or(remaining.len() - valid);
                skipped += invalid;
                remaining = &remaining[valid + invalid..];
            }
        }
    }
    tracing::warn!(
        skipped_bytes = skipped,
        "ignored invalid UTF-8 bytes in transcript view"
    );
    Ok(text)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn ignores_invalid_and_incomplete_sequences_but_preserves_valid_unicode() {
        let mut bytes = "中文😀\u{fffd}".as_bytes().to_vec();
        bytes.extend([0xff, 0xe2, 0x82]);
        assert_eq!(decode(bytes).unwrap(), "中文😀\u{fffd}");
    }
}
