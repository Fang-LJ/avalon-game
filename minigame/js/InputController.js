const parseRoomCode = (value) =>
  String(value || "")
    .replace(/\D/g, "")
    .slice(0, 6);
class InputController {
  constructor(wx) {
    this.wx = wx;
  }
  open({ value = "", digits = false, onChange, onConfirm, onError }) {
    this.close();
    const clean = (v) =>
      digits
        ? parseRoomCode(v)
        : String(v || "")
            .replace(/[\u0000-\u001f]/g, "")
            .slice(0, 32);
    this.input = (r) => {
      const value = clean(r.value);
      onChange(value);
      if (value !== r.value) this.wx.updateKeyboard?.({ value });
    };
    this.confirm = (r) => {
      const value = clean(r.value);
      onChange(value);
      this.close();
      onConfirm?.(value);
    };
    this.wx.onKeyboardInput(this.input);
    this.wx.onKeyboardConfirm(this.confirm);
    this.wx.showKeyboard({
      defaultValue: value,
      maxLength: digits ? 6 : 32,
      multiple: false,
      confirmHold: false,
      confirmType: "done",
      fail: () => {
        this.close();
        onError?.();
      },
    });
  }
  close() {
    if (!this.input) return;
    this.wx.offKeyboardInput(this.input);
    this.wx.offKeyboardConfirm(this.confirm);
    this.wx.hideKeyboard({});
    this.input = this.confirm = null;
  }
}
module.exports = { InputController, parseRoomCode };
