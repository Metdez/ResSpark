// Component tests render with `react-dom/client` + `act`; React only honours `act` when this flag is set.
declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean
}

globalThis.IS_REACT_ACT_ENVIRONMENT = true

export {}
