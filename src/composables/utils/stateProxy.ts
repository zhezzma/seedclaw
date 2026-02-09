
/**
 * Creates a Proxy that combines a reactive state object with a set of methods.
 * This ensures that properties added to the state asynchronously (or missing from initial definition)
 * are still accessible and reactive through the returned object.
 * 
 * @param state The reactive state object
 * @param methods An object containing methods to expose
 * @returns A Proxy that forwards property access to state or methods
 */
export function createStateProxy<T extends object, M extends object>(state: T, methods: M): T & M {
    return new Proxy({} as T & M, {
        get(target, prop, receiver) {
            // Priority: Methods then State
            if (prop in methods) {
                return methods[prop as keyof M]
            }
            return Reflect.get(state, prop)
        },
        set(target, prop, value, receiver) {
            // Cannot overwite methods
            if (prop in methods) {
                console.warn(`[createStateProxy] Attempting to overwrite method '${String(prop)}'`)
                return false
            }
            return Reflect.set(state, prop, value)
        },
        has(target, prop) {
            return prop in methods || prop in state
        },
        ownKeys(target) {
            // Return keys from both state and methods for tools like Object.keys()
            // Note: This relies on state being reactive and having keys available.
            // If keys are added dynamically to state later, they appear here when ownKeys is called.
            return [...new Set([...Reflect.ownKeys(state), ...Reflect.ownKeys(methods)])]
        },
        getOwnPropertyDescriptor(target, prop) {
            if (prop in methods) {
                return Reflect.getOwnPropertyDescriptor(methods, prop)
            }
            return Reflect.getOwnPropertyDescriptor(state, prop)
        }
    })
}
