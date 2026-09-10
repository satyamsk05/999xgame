export class BetButton {
  constructor(element, type, label, odds) {
    this.element = element;
    this.type = type;
    this.label = label;
    this.odds = odds;
  }

  setHighlight(highlight) {
    if (highlight) {
      this.element.style.borderColor = '#00e676';
    } else {
      this.element.style.borderColor = '';
    }
  }
}
