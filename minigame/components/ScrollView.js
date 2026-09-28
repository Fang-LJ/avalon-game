class ScrollView {
  constructor() {
    this.offset = 0;
    this.contentHeight = 0;
    this.height = 0;
  }
  setBounds(contentHeight, height) {
    this.contentHeight = contentHeight;
    this.height = height;
    this.drag(0);
  }
  drag(delta) {
    this.offset = Math.max(
      0,
      Math.min(
        Math.max(0, this.contentHeight - this.height),
        this.offset - delta,
      ),
    );
  }
}
module.exports = ScrollView;
