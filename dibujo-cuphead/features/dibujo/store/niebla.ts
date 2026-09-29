/**
 * Cuánto está la cámara dentro de una nube (0..1) en cada escena: al bajar hacia Cochabamba entra
 * en la nube del corazón (`SistemaSolar`) y en el valle sale por su base (`EscenaCochabamba`). El
 * pase de dibujo pinta la niebla con la mayor de las dos; `avance` mueve sus volutas con el camino.
 */
export const NIEBLA = { globo: 0, valle: 0, avance: 0 }
