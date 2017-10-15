import * as followActions from 'content/actions/follow';
import messages from 'shared/messages';
import HintKeyProducer from 'content/hint-key-producer';

const DEFAULT_HINT_CHARSET = 'abcdefghijklmnopqrstuvwxyz';

const broadcastMessage = (win, message) => {
  let json = JSON.stringify(message);
  let frames = [window.self].concat(Array.from(window.frames));
  frames.forEach(frame => frame.postMessage(json, '*'));
};

export default class FollowController {
  constructor(win, store) {
    this.win = win;
    this.store = store;
    this.state = {};
    this.keys = [];
    this.producer = null;
  }

  onMessage(message, sender) {
    switch (message.type) {
    case messages.FOLLOW_START:
      return this.store.dispatch(followActions.enable(message.newTab));
    case messages.FOLLOW_RESPONSE_COUNT_TARGETS:
      return this.create(message.count, sender);
    case messages.FOLLOW_KEY_PRESS:
      return this.keyPress(message.key);
    }
  }

  update() {
    let prevState = this.state;
    this.state = this.store.getState().follow;

    if (!prevState.enabled && this.state.enabled) {
      this.count();
    } else if (prevState.enabled && !this.state.enabled) {
      this.remove();
    } else if (prevState.keys !== this.state.keys) {
      this.updateHints();
    }
  }

  updateHints() {
    let shown = this.keys.filter(key => key.startsWith(this.state.keys));
    if (shown.length === 1) {
      this.activate();
      this.store.dispatch(followActions.disable());
    }

    broadcastMessage(this.win, {
      type: messages.FOLLOW_SHOW_HINTS,
      keys: this.state.keys,
    });
  }

  activate() {
    broadcastMessage(this.win, {
      type: messages.FOLLOW_ACTIVATE,
      keys: this.state.keys,
    });
  }

  keyPress(key) {
    switch (key) {
    case 'Enter':
      this.activate();
      this.store.dispatch(followActions.disable());
      break;
    case 'Escape':
      this.store.dispatch(followActions.disable());
      break;
    case 'Backspace':
    case 'Delete':
      this.store.dispatch(followActions.backspace());
      break;
    default:
      if (DEFAULT_HINT_CHARSET.includes(key)) {
        this.store.dispatch(followActions.keyPress(key));
      }
      break;
    }
    return true;
  }

  count() {
    this.producer = new HintKeyProducer(DEFAULT_HINT_CHARSET);
    let doc = this.win.document;
    let viewWidth = this.win.innerWidth || doc.documentElement.clientWidth;
    let viewHeight = this.win.innerHeight || doc.documentElement.clientHeight;
    let frameElements = this.win.document.querySelectorAll('frame,iframe');

    this.win.postMessage(JSON.stringify({
      type: messages.FOLLOW_REQUEST_COUNT_TARGETS,
      viewSize: { width: viewWidth, height: viewHeight },
      framePosition: { x: 0, y: 0 },
    }), '*');
    frameElements.forEach((element) => {
      let { left: frameX, top: frameY } = element.getBoundingClientRect();
      let message = JSON.stringify({
        type: messages.FOLLOW_REQUEST_COUNT_TARGETS,
        viewSize: { width: viewWidth, height: viewHeight },
        framePosition: { x: frameX, y: frameY },
      });
      element.contentWindow.postMessage(message, '*');
    });
  }

  create(count, sender) {
    let produced = [];
    for (let i = 0; i < count; ++i) {
      produced.push(this.producer.produce());
    }
    this.keys = this.keys.concat(produced);

    sender.postMessage(JSON.stringify({
      type: messages.FOLLOW_CREATE_HINTS,
      keysArray: produced,
      newTab: this.state.newTab,
    }), '*');
  }

  remove() {
    this.keys = [];
    broadcastMessage(this.win, {
      type: messages.FOLLOW_REMOVE_HINTS,
    });
  }
}
