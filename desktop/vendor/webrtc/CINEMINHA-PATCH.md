Vendored webrtc-rs 0.14.0 (MIT OR Apache-2.0), from crates.io.
Upstream: https://github.com/webrtc-rs/webrtc/tree/v0.14.0

Local change: allow SetLocal(rollback) from HaveLocalOffer/HaveRemotePranswer
in src/peer_connection/signaling_state.rs. set_description already implements
clearing the pending local SDP; its transition validator was missing this case.
This is required when a website peer and native peer renegotiate simultaneously.
The caller supplies the existing local SDP because upstream rejects empty SDP
before dispatching rollback. Covered by the desktop browser interoperability test.
