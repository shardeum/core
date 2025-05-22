# EventEmitter listener limit

`NetworkClass` sets a higher listener limit by calling `this.setMaxListeners(100)` in its constructor.
This enables many modules to attach network event handlers without triggering Node's default
`MaxListenersExceededWarning` after ten listeners. The value of 100 was selected as a reasonable upper bound.

If the application logs show `MaxListenersExceededWarning`, review the registered events and consider
adjusting the limit accordingly.
