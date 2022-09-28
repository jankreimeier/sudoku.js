import { Difficulty } from '../enum/difficulty.enum';
import { ErrorCode } from '../enum/error-code.enum';
import { Board, BoardGrid, CandidatesMap, PeersMap, UnitsMap } from '../interface/sudoku.interface';

export class Sudoku {

    private readonly DIFFICULTY_MAP: { [key in Difficulty]: number } = {
        [Difficulty.EASY]: 62,
        [Difficulty.MEDIUM]: 53,
        [Difficulty.HARD]: 44,
        [Difficulty.VERY_HARD]: 35,
        [Difficulty.INSANE]: 26,
        [Difficulty.INHUMAN]: 17,
    };
    private readonly DIGITS: string = '123456789';
    private readonly BLANK_BOARD: string = Array(81).fill('.').join('');
    private readonly ROWS: string = 'ABCDEFGHI';
    private readonly COLS: string = '123456789';

    private readonly MIN_GIVENS = 17;
    private readonly NR_SQUARES = 81;

    private readonly squares: string[] = [];
    private readonly units: string[][] = [];
    private readonly square_units_map: UnitsMap = {};
    private readonly square_peers_map: PeersMap = {};

    public static readonly BLANK_CHAR: string = '.';

    constructor() {
        this.squares = this._cross(this.ROWS, this.COLS);
        this.units = this._get_all_units(this.ROWS, this.COLS);
        this.square_units_map = this._get_square_units_map(this.squares, this.units);
        this.square_peers_map = this._get_square_peers_map(this.squares, this.square_units_map);
    }

    /**
     * Generate a new Sudoku puzzle of a particular `difficulty`.
     *
     * @param difficulty
     * @param unique
     */
    public generate(difficulty: Difficulty, unique: boolean = true): Board {
        let givens_for_difficulty = this.DIFFICULTY_MAP[difficulty];

        // force difficulty between 17 and 81 inclusive
        givens_for_difficulty = this._force_range(this.NR_SQUARES + 1, givens_for_difficulty, this.MIN_GIVENS);

        // get a set of squares and all possible candidates for each square
        const blank_board = this.BLANK_BOARD;
        const candidates = this._get_candidates_map(blank_board);

        // iterate over shuffled list of squares
        const shuffled_squares = this._shuffle(this.squares);
        for (const square of shuffled_squares) {
            // if an assignment of a random chioce causes a contradictoin, give up and try again
            const rand_candidate_idx = this._rand_range(candidates[square].length);
            const rand_candidate = candidates[square][rand_candidate_idx];
            if (!this._assign(candidates as CandidatesMap, square, rand_candidate)) {
                break;
            }

            // Make a list of all single candidates
            const single_candidates = [];
            for (const square of this.squares) {
                if (candidates[square].length == 1) {
                    single_candidates.push(candidates[square]);
                }
            }

            // if we have at least difficulty, and the unique candidate count is at least 8, return the puzzle!
            if (single_candidates.length >= givens_for_difficulty && this._strip_dups(single_candidates).length >= 8) {
                let board = '';
                let givens_idxs = [];

                for (const i in this.squares) {
                    const square = this.squares[i];

                    if (candidates[square].length == 1) {
                        board += candidates[square];
                        givens_idxs.push(i);
                    } else {
                        board += Sudoku.BLANK_CHAR;
                    }
                }

                // if we have more than `givens_for_difficulty`, remove some random givens
                // until we're down to exactly `givens_for_difficulty`
                const nr_givens = givens_idxs.length;
                if (nr_givens > givens_for_difficulty) {
                    givens_idxs = this._shuffle(givens_idxs);

                    for (let i = 0; i < nr_givens - givens_for_difficulty; ++i) {
                        const target = parseInt(givens_idxs[i]);
                        board = `${board.substring(0, target)}${Sudoku.BLANK_CHAR}${board.substring(target + 1)}`;
                    }
                }

                // double check board is solvable
                if (this.solve(board)) {
                    return board;
                }
            }
        }

        // give up and try a new puzzle
        return this.generate(difficulty);
    };

    /**
     * Solve a sudoku puzzle given a sudoku `board`, i.e., an 81-character
     *  string of this.DIGITS, 1-9, and spaces identified by '.', representing the
     *  squares. There must be a minimum of 17 givens. If the given board has no
     *  solutions, return false.
     *
     * Optionally set `reverse` to solve "backwards", i.e., rotate through the
     *  possibilities in reverse. Useful for checking if there is more than one
     *  solution.
     *
     * @param board
     * @param reverse
     */
    public solve(board: Board, reverse: boolean = false): string | boolean {
        // assure a valid board
        this.validate_board(board);

        // check number of givens is at least MIN_GIVENS
        const nr_givens = board.split('').filter(char => char !== Sudoku.BLANK_CHAR && this._in(char, this.DIGITS)).length;
        if (nr_givens < this.MIN_GIVENS) {
            throw new Error(ErrorCode.ERR_GIVENS_SIZE_INSUFFICIENT);
        }

        const candidates = this._get_candidates_map(board);
        const result = this._search(candidates as CandidatesMap, reverse);

        if (!result) {
            return false;
        }

        let solution = '';
        for (let square in result as CandidatesMap) {
            solution += result[square];
        }

        return solution;
    };

    /**
     * Get all possible candidates for each square as a map in the form
     *  {square: this.DIGITS} using recursive constraint propagation.
     * Return `false` if a contradiction is encountered.
     *
     * @param board
     */
    private _get_candidates_map(board: Board): CandidatesMap | boolean {
        // assure a valid board
        this.validate_board(board);

        const candidate_map = {};
        const squares_values_map = this._get_square_vals_map(board);

        // start by assigning every digit as a candidate to every square
        for (let si in this.squares) {
            candidate_map[this.squares[si]] = this.DIGITS;
        }

        // for each non-blank square, assign its value in the candidate map and propagate
        for (let square in squares_values_map) {
            const val = squares_values_map[square];

            if (this._in(val, this.DIGITS)) {
                const new_candidates = this._assign(candidate_map, square, val);

                // fail if we can't assign val to square
                if (!new_candidates) {
                    return false;
                }
            }
        }

        return candidate_map;
    };

    /**
     * Given a map of {square: candidates}, using depth-first search,
     *  recursively try all possible values until a solution is found, or false if no solution exists.
     *
     * @param candidates
     * @param reverse
     */
    private _search(candidates: CandidatesMap, reverse: boolean = false): CandidatesMap | boolean {
        // return if error in previous iteration
        if (!candidates) {
            return false;
        }

        // if only one candidate for every square, we've a solved puzzle!
        let max_nr_candidates = 0;
        let max_candidates_square = null;
        for (const square of this.squares) {
            const nr_candidates = candidates[square].length;

            if (nr_candidates > max_nr_candidates) {
                max_nr_candidates = nr_candidates;
                max_candidates_square = square;
            }
        }
        if (max_nr_candidates === 1) {
            return candidates;
        }

        // choose the blank square with the fewest possibilities > 1
        let min_nr_candidates = 10;
        let min_candidates_square = null;
        for (const square of this.squares) {
            const nr_candidates = candidates[square].length;

            if (nr_candidates < min_nr_candidates && nr_candidates > 1) {
                min_nr_candidates = nr_candidates;
                min_candidates_square = square;
            }
        }

        // recursively search through each of the candidates of the square starting with the one with the fewest candidates
        const min_candidates = candidates[min_candidates_square];
        if (!reverse) {
            for (const val of min_candidates.split('')) {
                const candidates_copy = JSON.parse(JSON.stringify(candidates));
                const candidates_next = this._search(this._assign(candidates_copy, min_candidates_square, val) as CandidatesMap);

                if (candidates_next) {
                    return candidates_next;
                }
            }
        }
        else {
            for (let vi = min_candidates.length - 1; vi >= 0; --vi) {
                const val = min_candidates[vi];

                const candidates_copy = JSON.parse(JSON.stringify(candidates));
                const candidates_next = this._search(
                    this._assign(candidates_copy, min_candidates_square, val) as CandidatesMap,
                    reverse
                );

                if (candidates_next) {
                    return candidates_next;
                }
            }
        }

        // if we get through all combinations of the square with the fewest candidates
        // without finding an answer, there isn't one
        return false;
    };

    /**
     * Eliminate all values, *except* for `val`, from `candidates` at `square` (candidates[square]), and propagate.
     * Return the candidates map when finished. If a contradiciton is found, return false.
     *
     * WARNING: This will modify the contents of `candidates` directly.
     *
     * @param candidates
     * @param square
     * @param val
     */
    private _assign(candidates: CandidatesMap, square: string, val: string): CandidatesMap | boolean {
        // grab a list of candidates without 'val'
        const other_vals = candidates[square].replace(val, '');

        // loop through all other values and eliminate them from the candidates at the current square, and propagate
        // if at any point we get a contradiction, return false
        for (const other_val of other_vals.split('')) {
            const candidates_next = this._eliminate(candidates, square, other_val);

            if (!candidates_next) {
                return false;
            }
        }

        return candidates;
    };

    /**
     * Eliminate `val` from `candidates` at `square`, (candidates[square]),
     *  and propagate when values or places <= 2. Return updated candidates,
     *  unless a contradiction is detected, in which case, return false.
     *
     * WARNING: This will modify the contents of `candidates` directly.
     *
     * @param candidates
     * @param square
     * @param val
     */
    private _eliminate(candidates: CandidatesMap, square: string, val: string): CandidatesMap | boolean {
        // if `val` has already been eliminated from candidates[square], return candidates
        if (!this._in(val, candidates[square])) {
            return candidates;
        }

        // remove `val` from candidates[square]
        candidates[square] = candidates[square].replace(val, '');

        // if the square has only candidate left, eliminate that value from its peers
        const nr_candidates = candidates[square].length;
        if (nr_candidates === 1) {
            const target_val = candidates[square];

            for (const peer of this.square_peers_map[square]) {
                const candidates_new = this._eliminate(candidates, peer, target_val);

                if (!candidates_new) {
                    return false;
                }
            }
        }
        // otherwise, if the square has no candidates, we have a contradiction.
        else if (nr_candidates === 0) {
            return false;
        }

        // if a unit is reduced to only one place for a value, then assign it
        for (const unit of this.square_units_map[square]) {
            const val_places = [];

            for (const unit_square of unit) {
                if (this._in(val, candidates[unit_square])) {
                    val_places.push(unit_square);
                }
            }

            // if there's no place for this value, we have a contradiction!
            if (val_places.length === 0) {
                return false;
            }
            // otherwise the value can only be in one place, therefore assign it there
            else if (val_places.length === 1) {
                const candidates_new = this._assign(candidates, val_places[0], val);

                if (!candidates_new) {
                    return false;
                }
            }
        }

        return candidates;
    };


    // Square relationships
    // -------------------------------------------------------------------------
    // Squares and their relationships with values, units, and peers.

    /**
     * Return a map of squares -> values.
     *
     * @param board
     */
    private _get_square_vals_map(board) {
        const squares_vals_map = {};

        // make sure `board` is a string of length 81
        if (board.length != this.squares.length) {
            throw new Error(ErrorCode.ERR_BOARD_SIZE_INVALID);
        }

        for (let i in this.squares) {
            squares_vals_map[this.squares[i]] = board[i];
        }

        return squares_vals_map;
    };

    /**
     * Return a map of `squares` and their associated units (row, col, box).
     *
     * @param squares
     * @param units
     */
    private _get_square_units_map(squares: string[], units: string[][]): UnitsMap {
        const square_unit_map = {};

        for (let si in squares) {
            const cur_square = squares[si];

            // maintain a list of the current square's units
            const cur_square_units = [];

            // look through the units, and see if the current square is in it,
            // and if so, add it to the list of the square's units.
            for (let ui in units) {
                const cur_unit = units[ui];

                if (cur_unit.indexOf(cur_square) !== -1) {
                    cur_square_units.push(cur_unit);
                }
            }

            // save the current square and its units to the map
            square_unit_map[cur_square] = cur_square_units;
        }

        return square_unit_map;
    };

    /**
     * Return a map of `squares` and their associated peers, i.e., a set of other squares in the square's unit.
     *
     * @param squares
     * @param units_map
     */
    private _get_square_peers_map(squares: string[], units_map: UnitsMap): PeersMap {
        const square_peers_map = {};

        for (let si in squares) {
            const cur_square = squares[si];
            const cur_square_units = units_map[cur_square];

            // maintain list of the current square's peers
            const cur_square_peers = [];

            // look through the current square's units map...
            for (let sui in cur_square_units) {
                const cur_unit = cur_square_units[sui];

                for (let ui in cur_unit) {
                    const cur_unit_square = cur_unit[ui];

                    if (cur_square_peers.indexOf(cur_unit_square) === -1 &&
                        cur_unit_square !== cur_square) {
                        cur_square_peers.push(cur_unit_square);
                    }
                }
            }

            // save the current square and its associated peers to the map
            square_peers_map[cur_square] = cur_square_peers;
        }

        return square_peers_map;
    };

    /**
     * Get a list of all units (rows, cols, boxes).
     *
     * @param rows
     * @param cols
     */
    private _get_all_units(rows: string, cols: string): string[][] {
        const units = [];

        // collect rows
        for (let row_val of rows.split('')) {
            units.push(this._cross(row_val, cols));
        }

        // collect columns
        for (let col_val of cols.split('')) {
            units.push(this._cross(rows, col_val));
        }

        // collect boxes
        const row_squares = [ 'ABC', 'DEF', 'GHI' ];
        const col_squares = [ '123', '456', '789' ];
        for (const rsi of row_squares) {
            for (const csi of col_squares) {
                units.push(this._cross(rsi, csi));
            }
        }

        return units;
    };


    // Conversions
    // -------------------------------------------------------------------------

    /**
     * Convert a board string to a two-dimensional array.
     *
     * @param board_string
     */
    public board_string_to_grid(board_string: Board): BoardGrid {
        const rows: BoardGrid = [];
        let cur_row = [];

        for (let [ key, val ] of Object.entries(board_string.split(''))) {
            cur_row.push(val);

            if (Number(key) % 9 == 8) {
                rows.push(cur_row);
                cur_row = [];
            }
        }

        return rows;
    };

    /**
     * Convert a board grid to a string.
     *
     * @param board_grid
     */
    public board_grid_to_string(board_grid: BoardGrid): Board {
        let board_string = '';

        for (let r = 0; r < 9; ++r) {
            for (let c = 0; c < 9; ++c) {
                board_string += board_grid[r][c];
            }
        }

        return board_string;
    };


    // Utility
    // -------------------------------------------------------------------------

    /**
     * Print a sudoku `board` to the console.
     *
     * @param board
     */
    public print_board(board: string): void {
        // assure a valid board
        this.validate_board(board);

        // vertical square padding
        const V_PADDING = ' ';
        // horizontal row padding
        const H_PADDING = '\n';

        // vertical box padding
        const V_BOX_PADDING = '  ';
        // horizontal box padding
        const H_BOX_PADDING = '\n';

        let display_string = '';

        for (const [ key, val ] of Object.entries(board.split(''))) {
            // add the square and some padding
            display_string += val + V_PADDING;

            // vertical edge of a box, insert v. box padding
            if (Number(key) % 3 === 2) {
                display_string += V_BOX_PADDING;
            }

            // end of a line, insert horiz. padding
            if (Number(key) % 9 === 8) {
                display_string += H_PADDING;
            }

            // horizontal edge of a box, insert h. box padding
            if (Number(key) % 27 === 26) {
                display_string += H_BOX_PADDING;
            }
        }

        console.log(display_string);
    };

    /**
     * Return if the given `board` is valid or not. If it's valid, return true.
     * If it's not, return a string of the reason why it's not.
     *
     * @param board
     */
    public validate_board(board: Board): boolean {
        // check for empty board
        if (!board) {
            throw new Error(ErrorCode.ERR_BOARD_EMPTY);
        }

        // check board length
        if (board.length !== this.NR_SQUARES) {
            throw new Error(ErrorCode.ERR_BOARD_SIZE_INVALID);
        }

        // check for invalid characters
        for (const char of board.split('')) {
            if (!this._in(char, this.DIGITS) && char !== Sudoku.BLANK_CHAR) {
                throw new Error(ErrorCode.ERR_BOARD_CHARACTER_INVALID);
            }
        }

        return true;
    };

    /**
     * Cross product of all elements in `a` and `b`, e.g.,
     *   this._cross("abc", "123") -> ["a1", "a2", "a3", "b1", "b2", "b3", "c1", "c2", "c3"]
     *
     * @param a
     * @param b
     */
    private _cross(a, b): string[] {
        const result = [];

        for (let ai in a) {
            for (let bi in b) {
                result.push(a[ai] + b[bi]);
            }
        }

        return result;
    };

    /**
     * Return if a value `v` is in sequence `seq`.
     *
     * @param v
     * @param seq
     */
    private _in(v, seq): boolean {
        return seq.indexOf(v) !== -1;
    };

    /**
     * Return the first element in `seq` that is true. If no element is true, return false.
     *
     * @param seq
     */
    private _first_true(seq: string[]): string | boolean {
        for (let i in seq) {
            if (seq[i]) {
                return seq[i];
            }
        }

        return false;
    };

    /**
     * Return a shuffled version of `seq`.
     * FIXME: @Jan: implement shuffle version with pattern for field shuffle
     *
     * @param seq
     */
    private _shuffle(seq: string[]): string[] {
        const shuffled = Array(seq.length).fill(false);

        for (let i in seq) {
            let ti = this._rand_range(seq.length);

            while (shuffled[ti]) {
                ti = (ti + 1) > (seq.length - 1) ? 0 : (ti + 1);
            }

            shuffled[ti] = seq[i];
        }

        return shuffled;
    };

    /**
     * Get a random integer in the range of `min` to `max` (non inclusive).
     * If `min` not defined, default to 0. If `max` not defined, throw an error.
     *
     * @param max
     * @param min
     */
    private _rand_range(max: number, min: number = 0): number {
        if (!max) {
            throw new Error(ErrorCode.ERR_RANGE_UNDEFINED);
        }

        return Math.floor(Math.random() * (max - min)) + min;
    };

    /**
     * Strip duplicate values from `seq`.
     *
     * @param seq
     */
    private _strip_dups(seq) {
        const seq_set = [];
        const dup_map = {};

        for (let i in seq) {
            const e = seq[i];

            if (!dup_map[e]) {
                seq_set.push(e);
                dup_map[e] = true;
            }
        }

        return seq_set;
    };

    /**
     * Force `nr` to be within the range from `min` to, but not including, `max`.
     * Parameter `min` is optional, and will default to 0. If `nr` is undefined, treat it as zero.
     *
     * @param max
     * @param nr
     * @param min
     */
    private _force_range(max: number, nr: number = 0, min: number = 0) {
        if (nr < min) {
            return min;
        }

        if (nr > max) {
            return max;
        }

        return nr;
    }

}