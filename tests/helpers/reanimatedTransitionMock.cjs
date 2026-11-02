// Model completion/cancellation separately from JS Modal lifecycle. Native FPS is
// intentionally not simulated by these component tests.
function reanimatedTransitionMock(getUi, { autoFinish = true } = {}) {
  const sharedValues = [], animations = [], easingCalls = [];
  function cancel(value) {
    const animation = value.pending;
    if (!animation || animation.finished) return;
    animation.finished = true;
    value.pending = null;
    animation.callback?.(false);
  }
  function finish(animation) {
    if (animation.finished) return;
    animation.finished = true;
    animation.shared.pending = null;
    animation.shared.presentation = animation.to;
    animation.callback?.(true);
  }
  const ease = t => t * t;
  return {
    sharedValues, animations, easingCalls, finish,
    module: {
      __esModule: true, default: { View: 'ReanimatedView' },
      ReduceMotion: { Never: 'never' },
      Easing: { ease, inOut(fn) {
        const easing = t => t < 0.5 ? fn(t * 2) / 2 : 1 - fn((1 - t) * 2) / 2;
        easingCalls.push({ fn, easing }); return easing;
      } },
      useSharedValue(initial) {
        const ref = getUi().react.useRef(null);
        if (!ref.current) {
          ref.current = { presentation: initial, pending: null,
            get() { return this.presentation; },
            set(value) {
              cancel(this);
              if (!value?.timing) { this.presentation = value; return; }
              const animation = { ...value, shared: this, finished: false };
              this.pending = animation; animations.push(animation);
              if (autoFinish) finish(animation);
            },
          };
          sharedValues.push(ref.current);
        }
        return ref.current;
      },
      useAnimatedStyle: fn => fn(), cancelAnimation: cancel,
      withTiming: (to, config, callback) => ({ timing: true, to, config, callback }),
      withSpring: (to, config, callback) => ({ timing: true, spring: true, to, config, callback }),
    },
  };
}
module.exports = { reanimatedTransitionMock };
