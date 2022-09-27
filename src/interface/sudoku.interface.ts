/**
 * String representation of a sudoku board.
 * It has a length of 81 and empty fields are '.' characters.
 */
export type Board = string;

/**
 * Grid representation of a sudoku board.
 * It is a two-dimensional array of board fields.
 */
export type BoardGrid = string[][];

/**
 * A map of `squares` and their associated candidate digits.
 */
export interface CandidatesMap {
    [key: string]: string;
}

/**
 * A map of `squares` and their associated units (row, col, box).
 */
export interface UnitsMap {
    [key: string]: string[][];
}

/**
 * A map of `squares` and their associated peers, i.e., a set of other squares in the square's unit.
 */
export interface PeersMap {
    [key: string]: string[];
}