# Brian App Technical Documentation

## Events Dispatching System

All of the events in the application are handled and dispatched by an internal event dispatcher.
This system is composed of two main components:

- the `FocusManager`, which is responsible for tracking the focused component and managing the focus stack; it implements the following interface:

```typescript
// Focus tracking
setFocus(component: FocusableComponent): void;
getFocusedComponent(): FocusableComponent | null;

// Focus stack (for nested focus scenarios)
pushFocus(component: FocusableComponent): void;
popFocus(): FocusableComponent | null;

// Focus events
onFocusChange(callback: (component: FocusableComponent | null, previousId: FocusableComponent | null) => void): void;
```

- the `EventDispatcher`, which is responsible for dispatching the events to the components; it implements the following interface:

```typescript
// Component registration
registerComponent(component: FocusableComponent): void;
unregisterComponent(componentId: string): void;

// Focus management
setFocus(componentId: string): void;
popFocus(): void;
getFocusedComponent(): FocusableComponent | null;

// Event handling
dispatchEvent(event: Event): Promise<boolean>;

// Global event handlers (for events that should always be handled)
addGlobalEventHandler(handler: EventHandler): void;
removeGlobalEventHandler(handler: EventHandler): void;
```
