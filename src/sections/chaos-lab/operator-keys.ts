/**
 * The storage keys and names the operator stamp is known by. Kept apart from operator.ts (the logic) so the
 * initial bundle can read the stamp (the /experiments/ header) without carrying the logic.
 *
 *   localStorage['ruphak-operator']        'v3' once all three experiments are done (spec 4.7)
 *   localStorage['ruphak-operator-steps']  'plug,tab,leader' (a subset): progress, shared by every tab
 *   window event 'ruphak-operator'         dispatched when the stamp state changes or is first read; the Colophon
 *                                          (which draws its own lit Experiments link) listens for the same name
 */
export const OPERATOR_KEY = 'ruphak-operator'
export const OPERATOR_STEPS_KEY = 'ruphak-operator-steps'
export const OPERATOR_VALUE = 'v3'
export const OPERATOR_EVENT = 'ruphak-operator'
