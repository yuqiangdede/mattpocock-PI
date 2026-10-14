//! Tolerant transcript views. Invalid bytes are omitted, never written back by reads.

use anyhow::Result;
use std::io::BufRead;

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

pub(super) fn read_line(reader: &mut impl BufRead, line: &mut String) -> Result<usize> {
    // Reuse the previous line's allocation. Offsets count source bytes, not decoded text.
    let mut bytes = std::mem::take(line).into_bytes();
    bytes.clear();
    let read = reader.read_until(b'\n', &mut bytes)?;
    *line = decode(bytes)?;
    Ok(read)
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

    #[test]
    fn line_lengths_remain_physical_byte_offsets() {
        let mut reader = &b"a\xff\nnext\n"[..];
        let mut line = String::new();
        assert_eq!(read_line(&mut reader, &mut line).unwrap(), 3);
        assert_eq!(line, "a\n");
        assert_eq!(read_line(&mut reader, &mut line).unwrap(), 5);
        assert_eq!(line, "next\n");
    }
}
