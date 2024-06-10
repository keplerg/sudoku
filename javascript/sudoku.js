// sudokuJS v0.4.4
// https://github.com/pocketjoso/sudokuJS
// Author: Jonas Ohlsson
// https://github.com/keplerg/sudoku
// Modified: Kepler Gelotte
// License: MIT

// NOTE: All variables starting with $ are jQuery objects

(function (window, $, undefined) {
    'use strict';
    /*TODO:
        --possible additions--
        toggle edit candidates
    */

    /**
    * Define a jQuery plugin
    */
    $.fn.sudokuJS = function(opts) {

        /*
         * constants
         *-----------*/

        var DIFFICULTY_EASY = "easy";
        var DIFFICULTY_MEDIUM = "medium";
        var DIFFICULTY_HARD = "hard";
        var DIFFICULTY_VERY_HARD = "very hard";

        var SOLVE_MODE_STEP = "step";
        var SOLVE_MODE_ALL = "all";

        var DIFFICULTIES = [
            DIFFICULTY_EASY,
            DIFFICULTY_MEDIUM,
            DIFFICULTY_HARD,
            DIFFICULTY_VERY_HARD
        ];

        /*
         * variables
         *-----------*/
        var history = [];
        opts = opts || {};
        var solveMode = SOLVE_MODE_STEP,
                difficulty = "unknown",
                candidatesShowing = false,
                editingCandidates = false,
                boardFinished = false,
                boardError = false,
                onlyUpdatedCandidates = false,
                gradingMode = false, //solving without updating UI
                generatingMode = false, //silence board unsolvable errors
                invalidCandidates = [], //used by the generateBoard function


        /*
        the score reflects how much increased difficulty the board gets by having the pattern rather than an already solved cell
        */
            strategies = [
                {title: "openSingles", fn:    openSingles, score : 0.1    },
                //harder for human to spot
                {title: "singleCandidate", fn:    singleCandidate, score : 9    },
                {title: "visualElimination", fn:    visualElimination, score : 8    },
                //only eliminates one candidate, should have lower score?
                {title: "nakedPair", fn:    nakedPair, score : 50    },
                {title: "pointingElimination", fn:    pointingElimination, score : 80    },
                //harder for human to spot
                {title: "hiddenPair", fn:    hiddenPair, score :    90    },
                {title: "nakedTriplet", fn:    nakedTriplet, score :    100 },
                //never gets used unless above strats are turned off?
                {title: "hiddenTriplet", fn:    hiddenTriplet, score :    140    },
                //never gets used unless above strats are turned off?
                {title: "nakedQuad", fn:    nakedQuad, score :    150 },
                //never gets used unless above strats are turned off?
                {title: "hiddenQuad", fn:    hiddenQuad, score :    280    }
            ],


        //nr of times each strategy has been used for solving this board - used to calculate difficulty score
            usedStrategies = [],
            originalBoard = [],
            board = [],
            boardSize,
            boardNumbers, // array of 1-9 by default, generated in initBoard

        //indexes of cells in each house - generated on the fly based on boardSize
            houses = [
                [], //hor. rows
                [], //vert. rows
                []  //boxes
            ];


        /*
         * selectors
         *-----------*/
         var $board = $(this),
            $boardInputs, //created
            $boardInputCandidates; //created


         /*
         * methods
         *-----------*/
         //shortcut for logging..
        function log(msg) {
            if (window.console && console.log) {
                console.log(msg);
            }
        }


        //array contains function
        var contains = function(a, obj) {
            for (let i = 0; i < a.length; i++) {
                if (a[i] === obj) {
                    return true;
                }
            }
            return false;
        };

        var uniqueArray = function(a) {
            let temp = {};
            for (let i = 0; i < a.length; i++)
                temp[a[i]] = true;
            let r = [];
            for (let k in temp)
                r.push(k);
            return r;
        };


        /* calcBoardDifficulty
         * --------------
         *  TYPE: solely based on strategies required to solve board (i.e. single count per strategy)
         *  SCORE: distinguish between boards of same difficulty.. based on point system. Needs work.
         * -----------------------------------------------------------------*/
        var calcBoardDifficulty = function(usedStrategies) {
            let boardDiff = {};
            if (usedStrategies.length < 3) {
                boardDiff.level = DIFFICULTY_EASY;
            } else if (usedStrategies.length < 4) {
                boardDiff.level = DIFFICULTY_MEDIUM;
            } else {
                boardDiff.level = DIFFICULTY_HARD;
            }

            let totalScore = 0;
            for (let i=0; i < strategies.length; i++) {
                let freq = usedStrategies[i];
                if (!freq) {
                    continue; //undefined or 0, won't effect score
                }
                let stratObj = strategies[i];
                totalScore += freq * stratObj.score;
            }
            boardDiff.score = totalScore;
            //log("totalScore: "+totalScore);

            if (totalScore > 750) {
                boardDiff.level = DIFFICULTY_VERY_HARD;
            }

            return boardDiff;
        };


        /* isBoardFinished
         * -----------------------------------------------------------------*/
        var isBoardFinished = function() {
            for (let i=0; i < boardSize*boardSize; i++) {
                if (board[i].val === null) {
                    return false;
                }
            }
            return true;
        };


        /* isBoardValid
         * -----------------------------------------------------------------*/
        var isBoardValid = function() {
            for (let i=0; i < boardSize*boardSize; i++) {
                if (! checkValidCandidate(i, board[i].val)) {
                    return false;
                }
            }
            return true;
        };


        /* generateHouseIndexList
         * -----------------------------------------------------------------*/
        var generateHouseIndexList = function() {
        // reset houses
        houses = [
                [], //hor. rows
                [], //vert. rows
                []  //boxes
            ]
            let boxSideSize = Math.sqrt(boardSize);

            for (let i=0; i < boardSize; i++) {
                let hrow = []; //horisontal row
                let vrow = []; //vertical row
                let box = [];
                for (let j=0; j < boardSize; j++) {
                    hrow.push(boardSize*i + j);
                    vrow.push(boardSize*j + i);

                    if (j < boxSideSize) {
                        for (let k=0; k < boxSideSize; k++) {
                            //0, 0,0, 27, 27,27, 54, 54, 54 for a standard sudoku
                            let a = Math.floor(i/boxSideSize) * boardSize * boxSideSize;
                            //[0-2] for a standard sudoku
                            let b = (i%boxSideSize) * boxSideSize;
                            let boxStartIndex = a +b; //0 3 6 27 30 33 54 57 60

                            //every boxSideSize box, skip boardSize num rows to next box (on new horizontal row)
                            //Math.floor(i/boxSideSize)*boardSize*2
                            //skip across horizontally to next box
                            //+ i*boxSideSize;
                            box.push(boxStartIndex + boardSize*j + k);
                        }
                    }
                }
                houses[0].push(hrow);
                houses[1].push(vrow);
                houses[2].push(box);
            }
        };


        /* initBoard
         * --------------
         *  inits board, variables.
         * -----------------------------------------------------------------*/
        var initBoard = function(opts) {
            let alreadyEnhanced = (board[0] !== null && typeof board[0] === "object");
            let nullCandidateList = [];
            boardNumbers = [];
            boardSize = (!board.length && opts.boardSize) || Math.sqrt(board.length) || 9;
            $board.attr("data-board-size", boardSize);
            if (boardSize % 1 !== 0 || Math.sqrt(boardSize) % 1 !== 0) {
                log("invalid boardSize: "+boardSize);
                if (typeof opts.boardErrorFn === "function") {
                    opts.boardErrorFn({msg: "invalid board size"});
                }
                return;
            }
            for (let i=0; i < boardSize; i++) {
                boardNumbers.push(i+1);
                nullCandidateList.push(null);
            }
            generateHouseIndexList();

            if (!alreadyEnhanced) {
                //enhance board to handle candidates, and possibly other params
                for (let j=0; j < boardSize*boardSize; j++) {
                    let cellVal = (typeof board[j] === "undefined") ? null : board[j];
                    let candidates = cellVal === null ? boardNumbers.slice() : nullCandidateList.slice();
                    let title = 'Row: '+Math.floor((j/boardSize)+1)+' Column: '+((j%boardSize)+1);
                    originalBoard[j] = {
                        val: cellVal,
                        candidates: candidates,
                        title: title
                    };
                    board[j] = {
                        val: cellVal,
                        candidates: candidates,
                        title: title
                    };
                }
            }
            // log(board);
        };


        /* renderBoard
         * --------------
         *  dynamically renders the board on the screen (into the DOM), based on board variable
         * -----------------------------------------------------------------*/
        var renderBoard = function() {
            // log("renderBoard");
            //log(board);
            let htmlString = "";
            for (let i=0; i < boardSize*boardSize; i++) {
                htmlString += renderBoardCell(originalBoard[i], board[i], i);

                if ((i+1) % boardSize === 0) {
                    htmlString += "<br>";
                }
            }
            //log(htmlString);
            $board.append(htmlString);

            //save important board elements
            $boardInputs = $board.find("input");
            $boardInputCandidates = $board.find(".candidates");
        };

        /* renderBoardCell
         * -----------------------------------------------------------------*/
        var renderBoardCell = function(originalBoardCell, boardCell, id) {
            let val = (boardCell.val === null) ? "" : boardCell.val;
            let disabled = (originalBoardCell.val !== null && originalBoardCell.val == boardCell.val);
            let candidates = boardCell.candidates || [];
            let candidatesString = buildCandidatesString(candidates);
            let maxlength = (boardSize < 10) ? " maxlength='1'" : "";
            // log(originalBoardCell.val);
            // log(boardCell.val);
            // log(disabled);
            return "<div class='sudoku-board-cell'>" +
                        //want to use type=number, but then have to prevent chrome scrolling and up down key behaviors..
                        "<input type='number' min='1' max='9' pattern='\\d*' "+((disabled)?'disabled ':'')+" id='input-"+id+"' value='"+val+"'"+maxlength+">" +
                        "<div id='input-"+id+"-candidates' class='candidates'>" + candidatesString + "</div>" +
                    "</div>";
        };


        /* buildCandidatesString
         * -----------------------------------------------------------------*/
        var buildCandidatesString = function(candidatesList) {
            let s="";
            for (let i=1; i < boardSize+1; i++) {
                if (contains(candidatesList,i)) {
                    s+= "<span>"+i+"</span> ";
                }
                // else {
                //     s+= "<span>&nbsp;</span> ";
                // }
            }
            return s;
        };


        /* updateUIBoard -
         * --------------
         *  updates the board with our latest values
         * -----------------------------------------------------------------*/
         var updateUIBoard = function(paintNew) {
            // log("updateUIBoard");
            $boardInputs
                .removeClass("highlight-val")
                .removeAttr("disabled")
                .each(function(i,v) {
                    let $input = $(this);
                    let originalVal = originalBoard[i].val;
                    let newVal = board[i].val;
                    if (newVal && parseInt($input.val()) !== newVal) {
                        $input.val(newVal);
                        if (paintNew) {
                            $input.addClass("highlight-val");
                        }
                    } else if (newVal === null) {
                        $input.val('');
                    }
                    if (originalVal !== null && originalVal == newVal) {
                        $input.attr("disabled", true)
                    }
                    let candidates = $input.siblings(".candidates");
                    // log(candidates);
                    visualEliminationOfCandidates();
                    if (newVal > 0) {
                        candidates.html('');
                    } else {
                        candidates.html(buildCandidatesString(board[i].candidates));
                    }
                });
        };


        /* updateUIBoardCell -
         * --------------
         *  updates ONE cell on the board with our latest values
         * -----------------------------------------------------------------*/
         var updateUIBoardCell = function(cellIndex, opts) {
            opts = opts || {};
            //log("updateUIBoardCell: "+cellIndex);
            if (!(opts.mode && opts.mode === "only-candidates")) {
                let newVal = board[cellIndex].val;

                //$boardInputs.removeClass("highlight-val");

                //shouldn't always add hightlight-val class
                $("#input-"+cellIndex)
                    .val(newVal)
                    .addClass("highlight-val");
            }
            $("#input-"+cellIndex+"-candidates")
                .html(buildCandidatesString(board[cellIndex].candidates));
        };

        /* uIBoardHighlightRemoveCandidate
         * --------------
         *  highlight candidate in cell that is about to be removed
         * -----------------------------------------------------------------*/
        var uIBoardHighlightRemoveCandidate = function(cellIndex, digit) {
            $("#input-"+cellIndex+"-candidates span:nth-of-type("+digit+")").addClass("candidate-to-remove");
        };

        /* uIBoardHighlightCandidate -
         * --------------
         *  highight candidate in cell that helps eliminate another candidate
         * -----------------------------------------------------------------*/
        var uIBoardHighlightCandidate = function(cellIndex, digit) {
            $("#input-"+cellIndex+"-candidates span:nth-of-type("+digit+")").addClass("candidate-highlight");
        };


        /* removeCandidatesFromCell
        -----------------------------------------------------------------*/
        var removeCandidatesFromCell = function(cell, candidates) {
            let cellUpdated = false;
            for (let i=0; i < candidates.length; i++) {
                //-1 because candidate '1' is at index 0 etc.
                if (board[cell].candidates[candidates[i]-1] !== null) {
                    board[cell].candidates[candidates[i]-1] = null; //writes to board variable
                    cellUpdated = true;
                }
            }
            if (cellUpdated && solveMode === SOLVE_MODE_STEP) {
                updateUIBoardCell(cell, {mode: "only-candidates"});
            }
        };


        /* checkValidCandidate
         * Check if valid candidate. Used to see if we can add candidate back to cell
        -----------------------------------------------------------------*/
        var checkValidCandidate = function(cell, candidate) {
            //for each type of house..(hor row / vert row / box)
            let hlength = houses.length;
            for (let i=0; i < hlength; i++) {

                //for each such house
                for (let j=0; j < boardSize; j++) {
                    let house = houses[i][j];
                    // only check if house contains this cell
                    if (house.includes(cell)) {
                        for (let k=0; k < boardSize; k++) {
                            if (cell !== house[k] && candidate === board[house[k]].val) {
                                return false;
                            }
                        }
                    }
                }
            }
            return true;
        }


        /* addCandidateBackToCells
        -----------------------------------------------------------------*/
        var addCandidateBackToCells = function(cell, candidate) {
            //for each type of house..(hor row / vert row / box)
            let hlength = houses.length;

            // need to reconstruct all candidates for cell only
            board[cell].candidates = boardNumbers.slice(0);

            for (let i=0; i < hlength; i++) {

                //for each such house
                for (let j=0; j < boardSize; j++) {
                    let house = houses[i][j];
                    // only check if house contains this cell
                    if (house.includes(cell)) {
                        for (let k=0; k < boardSize; k++) {
                            if (house[k] != cell && originalBoard[house[k]].val === null) {
                                if (checkValidCandidate(house[k], candidate)) {
                                    board[house[k]].candidates[candidate-1] = candidate;
                                }
                                if (board[house[k]].val > 0) {
                                    board[cell].candidates[board[house[k]].val-1] = null;
                                }
                            }
                        }
                    }
                }
            }
        };


        /* removeCandidatesFromCells
         * ---returns list of cells where any candidates where removed
        -----------------------------------------------------------------*/
        var removeCandidatesFromCells = function(cells, candidates) {
            //log("removeCandidatesFromCells");
            let cellsUpdated = [];
            for (let i=0; i < cells.length; i++) {
                let c = board[cells[i]].candidates;

                for (let j=0; j < candidates.length; j++) {
                    let candidate = candidates[j];
                    //-1 because candidate '1' is at index 0 etc.
                    if (c[candidate-1] !== null) {
                        c[candidate-1] = null; //NOTE: also deletes them from board variable
                        cellsUpdated.push(cells[i]); //will push same cell multiple times

                        if (solveMode===SOLVE_MODE_STEP) {
                            //highlight candidate as to be removed on board
                            uIBoardHighlightRemoveCandidate(cells[i],candidate);
                        }
                    }
                }
            }
            return cellsUpdated;
        };


        var highLightCandidatesOnCells = function(candidates, cells) {
            for (let i=0; i < cells.length; i++) {
                let cellCandidates = board[cells[i]].candidates;

                for (let j=0; j < cellCandidates.length; j++) {
                    if (contains(candidates, cellCandidates[j])) {
                        uIBoardHighlightCandidate(cells[i],cellCandidates[j]);
                    }
                }

            }
        };


        var resetBoardVariables = function() {
            boardFinished = false;
            boardError = false;
            onlyUpdatedCandidates = false;
            usedStrategies = [];
            gradingMode = false;
        };


        /* resetBoard
        -----------------------------------------------------------------*/
        var resetBoard = function() {
            resetBoardVariables();
            history = [];
            // log('cleared history');

            //reset UI
            $boardInputs
                .removeClass("highlight-val")
                .removeClass("board-cell-error")
                .removeAttr("disabled")
                .val("");

            //reset board variable
            // log(originalBoard);
            for (let i=0; i < boardSize*boardSize; i++) {
                board[i] = {
                    val: originalBoard[i].val,
                    candidates: [...originalBoard[i].candidates], // need to clone array
                    title: originalBoard[i].title
                };
                if (board[i].val !== null) {
                    $('#input-'+i).val(board[i].val);
                } else {
                    $('#input-'+i).val('');
                }
                $("#input-"+i+"-candidates").html(buildCandidatesString(board[i].candidates));
            }

            updateUIBoard(false);
        };


        /* clearBoard
        -----------------------------------------------------------------*/
        var clearBoard = function() {
            resetBoardVariables();

            //reset board variable
            let cands = boardNumbers.slice(0);
            for (let i=0; i < boardSize*boardSize; i++) {
                let title = 'Row: '+Math.floor((i/boardSize)+1)+' Column: '+((i%boardSize)+1);
                originalBoard[i] = {
                    val: null,
                    candidates: cands.slice(),
                    title: title
                };
                board[i] = {
                    val: null,
                    candidates: cands.slice(),
                    title: title
                };
            }

            //reset UI
            $boardInputs
                .removeClass("highlight-val")
                .removeClass("board-cell-error")
                .removeAttr("disabled")
                .val("");

            updateUIBoard(false);
        };


        /* setBoard
        -----------------------------------------------------------------*/
        var setBoard = function() {
            resetBoardVariables();
            history = [];
            // log('cleared history');

            //reset UI
            $boardInputs
                .removeClass("highlight-val")
                .removeClass("board-cell-error")
                .removeAttr("disabled")
                .val("");

            //reset board variable
            // log(board);
            for (let i=0; i < boardSize*boardSize; i++) {
                originalBoard[i] = {
                    val: board[i].val,
                    candidates: [...board[i].candidates], // need to clone array
                    title: board[i].title
                };
                if (board[i].val !== null) {
                    $('#input-'+i).attr('disabled', true);
                } else {
                    $('#input-'+i).attr('disabled', false);
                }
                // $("#input-"+i+"-candidates").html(buildCandidatesString(board[i].candidates));
            }

            updateUIBoard(false);
        };


        /* undo
         * -----------------------------------------------------------------*/
        var undo = function() {
            let entry = history.pop();
            if (! entry) {
                // log('no undo history left');
                return;
            }
            // log(entry);
            setBoardCell(entry.cell, entry.oldVal);
            visualEliminationOfCandidates();
            if (entry.val !== null) {
                addCandidateBackToCells(entry.cell, entry.val);
            }
            if (entry.error) {
                checkCellError(entry.cell, entry.oldVal, true);
            } else {
                checkCellError(entry.cell, entry.val, false);
            }
            updateUIBoard(true);
        };


        /* getNullCandidatesList
        -----------------------------------------------------------------*/
        var getNullCandidatesList = function() {
            let l = [];
            for (let i=0; i < boardSize; i++) {
                l.push(null);
            }
            return l;
        };


        /* resetCandidates
        -----------------------------------------------------------------*/
        var resetCandidates = function(updateUI) {
            let resetCandidatesList = boardNumbers.slice(0);
            for (let i=0; i < boardSize*boardSize; i++) {
                if (board[i].val === null) {
                    board[i].candidates = resetCandidatesList.slice(); //otherwise same list (not reference!) on every cell
                    if (updateUI) {
                        $("#input-"+i+"-candidates").html(buildCandidatesString(resetCandidatesList));
                    }
                } else if (updateUI) {
                        $("#input-"+i+"-candidates").html("");
                }
            }
        };

        /* setBoardCell - does not update UI
        -----------------------------------------------------------------*/
        var setBoardCell = function(cellIndex, val) {
            // log('setBoardCell('+cellIndex+', '+val+')');
            let boardCell = board[cellIndex];
            //update val
            boardCell.val = val;
            if (val !== null) {
                boardCell.candidates = getNullCandidatesList();
            }
        };

        /* indexInHouse
         * --------------
         *  returns index (0-9) for digit in house, false if not in house
         *  NOTE: careful evaluating returned index is IN row, as 0==false.
         * -----------------------------------------------------------------*/
         var indexInHouse = function(digit,house) {
             // log('indeInHouse('+digit+', '+house+')');
            for (let i=0; i < boardSize; i++) {
             // log(board[house[i]]+' = '+board[house[i]].val);
                if (board[house[i]].val == digit) {
                    return i;
                }
            }
            //not in house
            return false;
        };


         /* housesWithCell
         * --------------
         *  returns houses that a cell belongs to
         * -----------------------------------------------------------------*/
         var housesWithCell = function(cellIndex) {
            let boxSideSize = Math.sqrt(boardSize);
            let houses = [];
            //horisontal row
            let hrow = Math.floor(cellIndex/boardSize);
            houses.push(hrow);
            //vertical row
            let vrow = Math.floor(cellIndex%boardSize);
            houses.push(vrow);
            //box
            let box = (Math.floor(hrow/boxSideSize)*boxSideSize) + Math.floor(vrow/boxSideSize);
            houses.push(box);

            return houses;
        };


        /* numbersLeft
         * --------------
         *  returns unused numbers in a house
         * -----------------------------------------------------------------*/
         var numbersLeft = function(house) {
            let numbers = boardNumbers.slice();
            for (let i=0; i < house.length; i++) {
                for (let j=0; j < numbers.length; j++) {
                    //remove all numbers that are already being used
                    if (numbers[j] === board[house[i]].val) {
                        numbers.splice(j,1);
                    }
                }
            }
            //return remaining numbers
            return numbers;
        };


         /* numbersTaken
         * --------------
         *  returns used numbers in a house
         * -----------------------------------------------------------------*/
         var numbersTaken = function(house) {
            let numbers = [];
            for (let i=0; i < house.length; i++) {
                let n = board[house[i]].val;
                if (n !== null) {
                    numbers.push(n);
                }
            }
            //return remaining numbers
            return numbers;
        };


         /* candidatesLeft
         * --------------
         *  returns list of candidates for cell (with null's removed)
         * -----------------------------------------------------------------*/
         var candidatesLeft = function(cellIndex) {
            let t = [];
            let candidates = board[cellIndex].candidates;
            for (let i=0; i < candidates.length; i++) {
                if (candidates[i] !== null) {
                    t.push(candidates[i]);
                }
            }
            return t;
        };


         /* cellsForCandidate
         * --------------
         *  returns list of possible cells (cellIndex) for candidate (in a house)
         * -----------------------------------------------------------------*/
         var cellsForCandidate = function(candidate,house) {
            let t = [];
            for (let i=0; i < house.length; i++) {
                let cell = board[house[i]];
                let candidates = cell.candidates;
                if (contains(candidates, candidate)) {
                    t.push(house[i]);
                }
            }
            return t;
        };


         /* checkCellError
         * --------------
         *  checks if cell entry invalidates the board
         * -----------------------------------------------------------------*/
         var checkCellError = function(id, val, mark) {
            //check that this doesn't make board incorrect
            let status = $("#input-" + id).hasClass("board-cell-error");
            let temp = housesWithCell(id);
            //for each type of house
            for (let i=0; i < houses.length; i++) {

                if (indexInHouse(val, houses[i][temp[i]]) !== false) {
                    //digit already in house - board incorrect with user input
                    // log("board incorrect!");
                    let alreadyExistingCellInHouseWithDigit = houses[i][temp[i]][indexInHouse(val, houses[i][temp[i]])];

                    //this happens in candidate mode, if we highlight on ui board before entering value, and user then enters before us.
                    if (mark && alreadyExistingCellInHouseWithDigit == id) {
                        continue;
                    }

                    if (mark) {
                        $("#input-" + alreadyExistingCellInHouseWithDigit + ", #input-"+id)
                            .addClass("board-cell-error");
                    } else {
                        $("#input-" + alreadyExistingCellInHouseWithDigit + ", #input-"+id)
                            .removeClass("board-cell-error");
                    }
                }
            }
            return status;
        }


        /* visualEliminationOfCandidates
         * --------------
         * Only updates candidates. Goes through entire board and checks candidates by row column and box 
         * to determine candidates to remove.
         * -----------------------------------------------------------------*/
        function visualEliminationOfCandidates() {
            //for each type of house..(hor row / vert row / box)
            let hlength = houses.length;
            for (let i=0; i < hlength; i++) {

                //for each such house
                for (let j=0; j < boardSize; j++) {
                    let house = houses[i][j];
                    let candidatesToRemove = numbersTaken(house);
                    for (let k=0; k < boardSize; k++) {
                        let cell = house[k];
                        // let candidates = board[cell].candidates;
                        removeCandidatesFromCell(cell, candidatesToRemove);
                    }
                }
            }
        }


        /* visualAdditionOfCandidates
         * --------------
         * Only updates candidates. Goes through entire board and checks candidates by row column and box 
         * to determine candidates to add back in. This only gets called on an undo or removal of a number
         * from a cell.
         * -----------------------------------------------------------------*/
        function visualAdditionOfCandidates() {
            //for each type of house..(hor row / vert row / box)
            let hlength = houses.length;
            for (let i=0; i < hlength; i++) {

                //for each such house
                for (let j=0; j < boardSize; j++) {
                    let house = houses[i][j];
                    let candidatesToRemove = numbersTaken(house);
                    for (let k=0; k < boardSize; k++) {
                        let cell = house[k];
                        // let candidates = board[cell].candidates;
                        removeCandidatesFromCell(cell, candidatesToRemove);
                    }
                }
            }
        }


        /* openSingles
         * --------------
         *  checks for houses with just one empty cell - fills it in board variable if so
         * -- returns affectedCells - the updated cell(s), or false
         * -----------------------------------------------------------------*/
        function openSingles() {
            //log("looking for openSingles");

            //for each type of house..(hor row / vert row / box)
            let hlength = houses.length;
            for (let i=0; i < hlength; i++) {

                //for each such house
                let housesCompleted = 0; //if goes up to 9, sudoku is finished

                for (let j=0; j < boardSize; j++) {
                    let emptyCells = [];

                    // for each cell..
                    for (let k=0; k < boardSize; k++) {

                        let boardIndex = houses[i][j][k];
                        if (board[boardIndex].val === null) {
                            emptyCells.push({house: houses[i][j], cell: boardIndex});
                            if (emptyCells.length > 1) {
                                //log("more than one empty cell, house area :["+i+"]["+j+"]");
                                break;
                            }
                        }
                    }
                    //one empty cell found
                    if (emptyCells.length === 1) {
                        let emptyCell = emptyCells[0];
                        //grab number to fill in in cell
                        let val = numbersLeft(emptyCell.house);
                        if (val.length > 1) {
                            //log("openSingles found more than one answer for: "+emptyCell.cell+" .. board incorrect!");
                            boardError = true; //to force solve all loop to stop
                            return -1; //error
                        }

                        //log("fill in single empty cell " + emptyCell.cell+", val: "+val);

                        setBoardCell(emptyCell.cell, val[0]); //does not update UI
                        if (solveMode===SOLVE_MODE_STEP) {
                            uIBoardHighlightCandidate(emptyCell.cell, val[0]);
                        }

                        return [emptyCell.cell];
                    }
                    //no empty ells..
                    if (emptyCells.length === 0) {
                        housesCompleted++;
                        //log(i+" "+j+": "+housesCompleted);
                        if (housesCompleted === boardSize) {
                            boardFinished = true;
                            return -1; //special case, done
                        }
                    }
                }
            }
            return false;
        }


        /* visualElimination
         * --------------
         * Looks for houses where a digit only appears in one slot
         * -meaning we know the digit goes in that slot.
         * -- returns affectedCells - the updated cell(s), or false
         * -----------------------------------------------------------------*/
        function visualElimination() {
            //log("visualElimination");
            //for each type of house..(hor row / vert row / box)
            let hlength = houses.length;
            for (let i=0; i < hlength; i++) {

                //for each such house
                for (let j=0; j < boardSize; j++) {
                    let house = houses[i][j];
                    let digits = numbersLeft(house);

                    //for each digit left for that house
                    for (let k=0; k < digits.length; k++) {
                        let digit = digits[k];
                        var possibleCells = [];

                        //for each cell in house
                        for (let l=0; l < boardSize; l++) {
                            let cell = house[l];
                            let boardCell = board[cell];
                            //if the digit only appears as a candidate in one slot, that's where it has to go
                            if (contains(boardCell.candidates, digit)) {
                                possibleCells.push(cell);
                                if (possibleCells.length > 1) {
                                    break; //no we can't tell anything in this case
                                }
                            }
                        }

                        if (possibleCells.length === 1) {
                            let cellIndex = possibleCells[0];

                            //log("only slot where "+digit+" appears in house. ");

                            setBoardCell(cellIndex, digit); //does not update UI

                            if (solveMode===SOLVE_MODE_STEP) {
                                uIBoardHighlightCandidate(cellIndex, digit);
                            }

                            onlyUpdatedCandidates = false;
                            return [cellIndex]; //one step at the time
                        }
                    }

                }
            }
            return false;
        }


        /* singleCandidate
         * --------------
         * Looks for cells with only one candidate
         * -- returns affectedCells - the updated cell(s), or false
         * -----------------------------------------------------------------*/
        function singleCandidate() {
            //for each cell
            for (let i=0; i < board.length; i++) {
                let cell = board[i];
                let candidates = cell.candidates;

                //for each candidate for that cell
                let possibleCandidates = [];
                for (let j=0; j < candidates.length; j++) {
                    if (candidates[j] !== null) {
                        possibleCandidates.push(candidates[j]);
                    }
                    if (possibleCandidates.length > 1) {
                        break; //can't find answer here
                    }
                }
                if (possibleCandidates.length === 1) {
                    let digit = possibleCandidates[0];
                    //log("only one candidate in cell: "+digit+" in house. ");
                    setBoardCell(i, digit); //does not update UI
                    if (solveMode===SOLVE_MODE_STEP) {
                        uIBoardHighlightCandidate(i, digit);
                    }

                    onlyUpdatedCandidates = false;
                    return [i]; //one step at the time
                }
            }
            return false;
        }


        /* pointingElimination
         * --------------
         * if candidates of a type (digit) in a box only appear on one row, all other
         * same type candidates can be removed from that row
         ------------OR--------------
         * same as above, but row instead of box, and vice versa.
         * -- returns affectedCells - the updated cell(s), or false
         * -----------------------------------------------------------------*/
        function pointingElimination() {
            let affectedCells = false;

            //for each type of house..(hor row / vert row / box)
            let hlength = houses.length;
            for (let a=0; a < hlength; a++) {
                let houseType = a;

                for (let i=0; i < boardSize; i++) {
                    let house = houses[houseType][i];

                    //for each digit left for this house
                    let digits = numbersLeft(house);
                    for (let j=0; j< digits.length; j++) {
                        let digit = digits[j];
                        //check if digit (candidate) only appears in one row (if checking boxes),
                        //, or only in one box (if checking rows)

                        let sameAltHouse = true; //row if checking box, and vice versa
                        let houseId = -1;
                        //when point checking from box, need to compare both kind of rows
                        //that box cells are also part of, so use houseTwoId as well
                        let houseTwoId = -1;
                        let sameAltTwoHouse = true;
                        let cellsWithCandidate = [];
                        //let cellDistance = null;

                        //for each cell
                        for (let k=0; k < house.length; k++) {
                            let cell = house[k];

                            if (contains(board[cell].candidates,digit)) {
                                let cellHouses = housesWithCell(cell);
                                let newHouseId = (houseType ===2) ? cellHouses[0] : cellHouses[2];
                                let newHouseTwoId = (houseType ===2) ? cellHouses[1] : cellHouses[2];

                                if (cellsWithCandidate.length > 0) {
                                    if (newHouseId !== houseId) {
                                        sameAltHouse = false;
                                    }
                                    if (houseTwoId !== newHouseTwoId) {
                                        sameAltTwoHouse = false;
                                    }
                                    if (sameAltHouse === false && sameAltTwoHouse === false) {
                                        break; //not in same altHouse (box/row)
                                    }
                                }
                                houseId = newHouseId;
                                houseTwoId = newHouseTwoId;
                                cellsWithCandidate.push(cell);
                            }
                        }
                        if ((sameAltHouse === true || sameAltTwoHouse === true ) && cellsWithCandidate.length > 0) {
                            //log("sameAltHouse..");
                            //we still need to check that this actually eliminates something, i.e. these possible cells can't be only in house

                            //first figure out what kind of house we are talking about..
                            let h = housesWithCell(cellsWithCandidate[0]);
                            let altHouseType = 2;
                            if (houseType ===2) {
                                if (sameAltHouse) {
                                    altHouseType = 0;
                                } else {
                                    altHouseType = 1;
                                }
                            }

                            let altHouse = houses[altHouseType][h[altHouseType]];
                            let cellsEffected = [];

                            //log("houses["+houseType+"]["+h[houseType]+"].length: "+houses[houseType][h[houseType]].length);

                            //need to remove cellsWithCandidate - from cells to remove from
                            for (let x=0; x< altHouse.length; x++) {
                                if (!contains(cellsWithCandidate, altHouse[x])) {
                                    cellsEffected.push(altHouse[x]);
                                }
                            }
                            //log("houses["+houseType+"]["+h[houseType]+"].length: "+houses[houseType][h[houseType]].length);

                            //remove all candidates on altHouse, outside of house
                            let cellsUpdated = removeCandidatesFromCells(cellsEffected, [digit]);

                            if (cellsUpdated.length > 0) {
                                // log("pointing: digit "+digit+", from houseType: "+houseType);

                                if (solveMode === SOLVE_MODE_STEP) {
                                    highLightCandidatesOnCells([digit], cellsWithCandidate);
                                }

                                onlyUpdatedCandidates = true;

                                //return cellsUpdated.concat(cellsWithCandidate);
                                //only return cells where we actually update candidates
                                return cellsUpdated;
                            }
                        }
                    }
                }
            }
            return false;
        }


        /* nakedCandidates
         * --------------
         * looks for n nr of cells in house, which together has exactly n unique candidates.
            this means these candidates will go into these cells, and can be removed elsewhere in house.
         *
         * -- returns affectedCells - the updated cell(s), or false
         * -----------------------------------------------------------------*/
        function nakedCandidates(n) {

            //for each type of house..(hor row / vert row / box)
            let hlength = houses.length;
            for (let i=0; i < hlength; i++) {

                //for each such house
                for (let j=0; j < boardSize; j++) {
                    //log("["+i+"]"+"["+j+"]");
                    let house = houses[i][j];
                    if (numbersLeft(house).length <= n) { //can't eliminate any candidates
                        continue;
                    }
                    var combineInfo = []; //{cell: x, candidates: []}, {} ..
                    //combinedCandidates,cellsWithCandidate;
                    var minIndexes = [-1];
                    //log("--------------");
                    //log("house: ["+i+"]["+j+"]");

                    //checks every combo of n candidates in house, returns pattern, or false
                    let result = checkCombinedCandidates(house, 0);
                    if (result !== false) {
                        return result;
                    }
                }
            }
            return false; //pattern not found

            function checkCombinedCandidates(house, startIndex) {
                //log("startIndex: "+startIndex);
                for (let i=Math.max(startIndex, minIndexes[startIndex]); i < boardSize-n+startIndex; i++) {
                    //log(i);

                    //never check this cell again, in this loop
                    minIndexes[startIndex] = i+1;
                    //or in a this loop deeper down in recursions
                    minIndexes[startIndex+1] = i+1;

                    //if (startIndex === 0) {
                    //    combinedCandidates = [];
                    //    cellsWithCandidate = []; //reset
                    //}
                    let cell = house[i];
                    let cellCandidates = candidatesLeft(cell);

                    if (cellCandidates.length === 0 || cellCandidates.length > n) {
                        continue;
                    }

                    //try adding this cell and it's cellCandidates,
                    //but first need to check that that doesn't make (unique) amount of
                    //candidates in combineInfo > n

                    //if this is the first item we add, we don't need this check (above one is enough)
                    if (combineInfo.length > 0) {
                        let temp = cellCandidates.slice();
                        for (let a =0; a < combineInfo.length; a++) {
                            let candidates = combineInfo[a].candidates;
                            for (let b=0; b < candidates.length; b++) {
                                if (!contains(temp,candidates[b])) {
                                    temp.push(candidates[b]);
                                }
                            }
                        }
                        if (temp.length > n) {
                            continue; //combined candidates spread over > n cells, won't work
                        }

                    }

                    combineInfo.push({cell: cell, candidates: cellCandidates});

                    if (startIndex < n-1) {
                        //still need to go deeper into combo
                        let r = checkCombinedCandidates(house, startIndex+1);
                        //when we come back, check if that's because we found answer.
                        //if so, return with it, otherwise, keep looking
                        if (r !== false) {
                            return r;
                        }
                    }

                    //check if we match our pattern
                    //if we have managed to combine n-1 cells,
                    //(we already know that combinedCandidates is > n)
                    //then we found a match!
                    if (combineInfo.length === n) {
                        //now we need to check whether this eliminates any candidates

                        let cellsWithCandidates = [];
                        let combinedCandidates = []; //not unique either..
                        for (let x=0; x < combineInfo.length;x++) {
                            cellsWithCandidates.push(combineInfo[x].cell);
                            combinedCandidates = combinedCandidates.concat(combineInfo[x].candidates);
                        }

                        //get all cells in house EXCEPT cellsWithCandidates
                        let cellsEffected = [];
                        for (let y=0; y< boardSize; y++) {
                            if (!contains(cellsWithCandidates, house[y])) {
                                cellsEffected.push(house[y]);
                            }
                        }

                        //remove all candidates on house, except the on cells matched in pattern
                        let cellsUpdated = removeCandidatesFromCells(cellsEffected, combinedCandidates);

                        //if it does remove candidates, we're succeded!
                        if (cellsUpdated.length > 0) {
                            //log("nakedCandidates: ");
                            //log(combinedCandidates);

                            if (solveMode === SOLVE_MODE_STEP) {
                                highLightCandidatesOnCells(combinedCandidates, cellsWithCandidates);
                            }

                            onlyUpdatedCandidates = true;
                            //return cellsWithCandidates.concat(cellsUpdated);

                            //return cells we actually update, duplicates removed
                            return uniqueArray(cellsUpdated);
                        }
                    }
                }
                if (startIndex > 0) {
                    //if we added a value to our combo check, but failed to find pattern, we now need drop that value and go back up in chain and continue to check..
                    if (combineInfo.length > startIndex-1) {
                        //log("nakedCans: need to pop last added values..");
                        combineInfo.pop();
                    }
                }
                return false;
            }
        }


        /* nakedPair
         * --------------
         * see nakedCandidateElimination for explanation
         * -- returns affectedCells - the updated cell(s), or false
         * -----------------------------------------------------------------*/
        function nakedPair() {
            return nakedCandidates(2);
        }

        /* nakedTriplet
         * --------------
         * see nakedCandidateElimination for explanation
         * -- returns affectedCells - the updated cell(s), or false
         * -----------------------------------------------------------------*/
        function nakedTriplet() {
            return nakedCandidates(3);
        }

        /* nakedQuad
         * --------------
         * see nakedCandidateElimination for explanation
         * -- returns affectedCells - the updated cell(s), or false
         * -----------------------------------------------------------------*/
        function nakedQuad() {
            return nakedCandidates(4);
        }


        /* hiddenLockedCandidates
         * --------------
         * looks for n nr of cells in house, which together has exactly n unique candidates.
            this means these candidates will go into these cells, and can be removed elsewhere in house.
         *
         * -- returns affectedCells - the updated cell(s), or false
         * -----------------------------------------------------------------*/
        function hiddenLockedCandidates(n) {

            //for each type of house..(hor row / vert row / box)
            let hlength = houses.length;
            for (let i=0; i < hlength; i++) {

                //for each such house
                for (let j=0; j < boardSize; j++) {
                    let house = houses[i][j];
                    if (numbersLeft(house).length <= n) { //can't eliminate any candidates
                        continue;
                    }
                    var combineInfo = []; //{candate: x, cellsWithCandidate: []}, {} ..
                    //combinedCandidates,cellsWithCandidate;
                    var minIndexes = [-1];
                    //log("--------------");
                    //log("house: ["+i+"]["+j+"]");

                    //checks every combo of n candidates in house, returns pattern, or false
                    let result = checkLockedCandidates(house, 0);
                    if (result !== false) {
                        return result;
                    }
                }
            }
            return false; //pattern not found

            function checkLockedCandidates(house, startIndex) {
                //log("startIndex: "+startIndex);
                for (let i=Math.max(startIndex, minIndexes[startIndex]); i <= boardSize-n+startIndex; i++) {

                    //log(i);
                    //never check this cell again, in this loop
                    minIndexes[startIndex] = i+1;
                    //or in a this loop deeper down in recursions
                    minIndexes[startIndex+1] = i+1;

                    let candidate = i+1;
                    //log(candidate);

                    let possibleCells = cellsForCandidate(candidate,house);

                    if (possibleCells.length === 0 || possibleCells.length > n) {
                        continue;
                    }

                    //try adding this candidate and it's possible cells,
                    //but first need to check that that doesn't make (unique) amount of
                    //possible cells in combineInfo > n
                    if (combineInfo.length > 0) {
                        let temp = possibleCells.slice();
                        for (let a=0; a < combineInfo.length; a++) {
                            let cells = combineInfo[a].cells;
                            for (let b=0; b < cells.length; b++) {
                                if (!contains(temp,cells[b])) {
                                    temp.push(cells[b]);
                                }
                            }
                        }
                        if (temp.length > n) {
                            //log("combined candidates spread over > n cells");
                            continue; //combined candidates spread over > n cells, won't work
                        }

                    }

                    combineInfo.push({candidate: candidate, cells: possibleCells});

                    if (startIndex < n-1) {
                        //still need to go deeper into combo
                        let r = checkLockedCandidates(house, startIndex+1);
                        //when we come back, check if that's because we found answer.
                        //if so, return with it, otherwise, keep looking
                        if (r !== false) {
                            return r;
                        }
                    }
                    //check if we match our pattern
                    //if we have managed to combine n-1 candidates,
                    //(we already know that cellsWithCandidates is <= n)
                    //then we found a match!
                    if (combineInfo.length === n) {

                        //now we need to check whether this eliminates any candidates

                        let combinedCandidates = []; //not unique now...
                        let cellsWithCandidates = []; //not unique either..
                        for (let x=0; x < combineInfo.length; x++) {
                            combinedCandidates.push(combineInfo[x].candidate);
                            cellsWithCandidates = cellsWithCandidates.concat(combineInfo[x].cells);
                        }

                        let candidatesToRemove = [];
                        for (let c=0; c < boardSize; c++) {
                            if (!contains(combinedCandidates, c+1)) {
                                candidatesToRemove.push(c+1);
                            }
                        }
                        //log("candidates to remove:")
                        //log(candidatesToRemove);

                        //remove all other candidates from cellsWithCandidates
                        let cellsUpdated = removeCandidatesFromCells(cellsWithCandidates, candidatesToRemove);

                        //if it does remove candidates, we're succeded!
                        if (cellsUpdated.length > 0) {
                            //log("hiddenLockedCandidates: ");
                            //log(combinedCandidates);

                            if (solveMode === SOLVE_MODE_STEP) {
                                highLightCandidatesOnCells(combinedCandidates, cellsWithCandidates);
                            }

                            onlyUpdatedCandidates = true;

                            //filter out duplicates
                            return uniqueArray(cellsWithCandidates);
                        }
                    }
                }
                if (startIndex > 0) {
                    //if we added a value to our combo check, but failed to find pattern, we now need drop that value and go back up in chain and continu to check..
                    if (combineInfo.length > startIndex-1) {
                        combineInfo.pop();
                    }
                }
                return false;
            }
        }


        /* hiddenPair
         * --------------
         * see hiddenLockedCandidates for explanation
         * -- returns affectedCells - the updated cell(s), or false
         * -----------------------------------------------------------------*/
        function hiddenPair() {
            return hiddenLockedCandidates(2);
        }


        /* hiddenTriplet
         * --------------
         * see hiddenLockedCandidates for explanation
         * -- returns affectedCells - the updated cell(s), or false
         * -----------------------------------------------------------------*/
        function hiddenTriplet() {
            return hiddenLockedCandidates(3);
        }

        /* hiddenQuad
         * --------------
         * see hiddenLockedCandidates for explanation
         * -- returns affectedCells - the updated cell(s), or false
         * -----------------------------------------------------------------*/
        function hiddenQuad() {
            return hiddenLockedCandidates(4);
        }


        /* solveFn
         * --------------
         *  applies strategy i (where i represents strategy, ordered by simplicity
         *  -if strategy fails (too advanced a sudoku) AND an more advanced strategy exists:
         *        calls itself with i++
         *  returns canContinue true|false - only relevant for solveMode "all"
         * -----------------------------------------------------------------*/
        var nrSolveLoops = 0;
        var affectedCells = false;

        var solveFn = function(i) {
            // log('solceFn('+i+')');
            // log('finished: '+boardFinished);
            if (boardFinished) {
                if (!gradingMode) {
                    updateUIBoard(false);
                    //log("finished!");
                    //log("usedStrats:")
                    //log(usedStrategies);

                    //callback
                    if (typeof opts.boardFinishedFn === "function") {
                        opts.boardFinishedFn({
                            difficultyInfo: calcBoardDifficulty(usedStrategies)
                        });
                    }
                }

                return false; //we're done!

            } else if (solveMode === SOLVE_MODE_STEP) {
                //likely that we're updating twice if !candidatesShowing && !onlyUpdatedCandidates,
                //but we can't tell if user just toggled candidatesShowing.. so have to do it here (again).
                if (affectedCells && affectedCells !== -1) {
                    //update candidates and/or new numbers
                    //remove highlights from last step
                    $boardInputs.removeClass("highlight-val");
                    $(".candidate-highlight").removeClass("candidate-highlight");
                    //update board with new affected cell(s) info
                    for (let j=0; j < affectedCells.length; j++) {
                        if (boardError) {
                            // add entry to history
                            let historyEntry = {'cell': affectedCells[j], 'error': false, 'oldVal': null, 'val': board[affectedCells[j]].val};
                            history.push(historyEntry);
                            // log(history);
                        }

                        updateUIBoardCell(affectedCells[j]);
                    }
                }
            }

            nrSolveLoops++;
            let strat = strategies[i].fn;
            //log("use strat nr:" +i);
            affectedCells = strat();

            if (affectedCells === false) {
                if (strategies.length > i+1) {
                    return solveFn(i+1);
                } else {
                    if (typeof opts.boardErrorFn === "function" && !generatingMode) {
                        opts.boardErrorFn({msg: "no more strategies"});
                    }

                    if (!gradingMode && !generatingMode && solveMode===SOLVE_MODE_ALL) {
                        updateUIBoard(false);
                    }
                    return false;
                }

            } else if (boardError) {
                if (typeof opts.boardErrorFn === "function") {
                    opts.boardErrorFn({msg: "Board incorrect"});
                }

                /*
                if (solveMode === SOLVE_MODE_ALL) {
                    updateUIBoard(false); //show user current state of board... how much they need to reset for it to work again.
                }
                */

                return false; //we can't do no more solving

            } else if (solveMode===SOLVE_MODE_STEP) {
                // if user clicked solve step, and we're only going to fill in a new value (not messing with candidates) - then show user straight away
                //callback
                if (typeof opts.boardUpdatedFn === "function") {
                    opts.boardUpdatedFn({cause: strategies[i].title, cellsUpdated: affectedCells});
                }

                //check if this finished the board
                if (isBoardFinished()) {
                    boardFinished = true;
                    //callback
                    if (typeof opts.boardFinishedFn === "function") {
                        opts.boardFinishedFn({
                            difficultyInfo: calcBoardDifficulty(usedStrategies)
                        });
                    }
                    //paint the last cell straight away
                    if (candidatesShowing) {
                        updateUIBoard(false);
                    }
                }

                //if a new number was filled in, show this on board
                if (!onlyUpdatedCandidates && affectedCells && affectedCells !== -1) {
                    //remove highlights from last step
                    $boardInputs.removeClass("highlight-val");
                    $(".candidate-highlight").removeClass("candidate-highlight");
                    //update board with new affected cell(s) info
                    for (let k=0; k < affectedCells.length; k++) {
                        // add entry to history
                        let historyEntry = {'cell': affectedCells[k], 'error': false, 'oldVal': null, 'val': board[affectedCells[k]].val};
                        history.push(historyEntry);
                        // log(history);

                        updateUIBoardCell(affectedCells[k]);
                    }
                }
            }

            //we got an answer, using strategy i
            if (typeof usedStrategies[i] === "undefined") {
                usedStrategies[i] = 0;
            }
            usedStrategies[i] = usedStrategies[i] + 1;
            //if we only updated candidates, make sure they're showing
            if (!gradingMode && !candidatesShowing && onlyUpdatedCandidates) {// && i > 3){
                showCandidates();

                //callback in case UI has toggle btn, so it can be updated
                if (typeof opts.candidateShowToggleFn === "function") {
                    opts.candidateShowToggleFn(true);
                }
            }

            return true; // can continue
        };


        /* keyboardMoveBoardFocus - puts focus on adjacent board cell
         * -----------------------------------------------------------------*/
        var keyboardMoveBoardFocus = function(currentId, keyCode) {
            let newId = currentId;
            if (keyCode ===39) { //right
                newId++;
            } else if (keyCode === 37) { //left
                newId--;
            } else if (keyCode === 40) { //down
                newId = newId + boardSize;
            } else if (keyCode === 38) { //up
                newId = newId - boardSize;
            }

            //out of bounds
            if (newId < 0 || newId > (boardSize*boardSize)) {
                return;
            }

            //focus input
            $("#input-"+newId).focus();
        };


        /* toggleCandidateOnCell - used for editingCandidates mode
         * -----------------------------------------------------------------*/
        var toggleCandidateOnCell = function(candidate, cell) {
            let boardCell = board[cell];
            if (boardCell.val) {
                return;  // don't modify candidates when a cell already has a number
            }
            let c = boardCell.candidates;
            c[candidate-1] = c[candidate-1] === null ? candidate : null;
            if (solveMode === SOLVE_MODE_STEP) {
                updateUIBoardCell(cell, {mode: "only-candidates"});
            }
        };

        /* keyboardNumberInput - update our board model
         * -----------------------------------------------------------------*/
        var keyboardNumberInput = function($input, id) {
            let val = parseInt($input.val());
            let oldVal = board[id].val;
            let cellError = false;

            if (editingCandidates) {
                toggleCandidateOnCell(val, id);
                // reset value on board
                $input.val(board[id].val);
                return;
            }

            // log(id+": "+val +" entered.");

            let candidates = getNullCandidatesList(); //[null,null....null];

            if (val > 0) {
                //update board cell
                cellError = checkCellError(id, val, true);
                setBoardCell(id, val);
                visualEliminationOfCandidates();

                //check if that finished board
                if (isBoardFinished()) {
                    boardFinished = true;
                    log("user finished board!");
                    if (typeof opts.boardFinishedFn === "function") {
                        alert('Congratulations!!!');
                        opts.boardFinishedFn({
                            //we rate the board via what strategies was used to solve it
                            //we don't have this info if user solved it, unless we
                            //always analyze board on init.. but that could be slow.

                            //difficultyInfo: null
                        });
                    }
                }
            } else {
                boardError = false; //reset, in case they fixed board - otherwise, we'll find the error again
                val = null; // in case isNaN(val)
                //add back candidate to cells
                if (oldVal > 0) {
                    setBoardCell(id, null);
                    addCandidateBackToCells(id, oldVal);
                }

                //remove errors as soon as they clear one
                if ($("#input-"+id).hasClass("board-cell-error")) {
                    cellError = checkCellError(id, oldVal, false);
                }
            }

            // add entry to history
            let historyEntry = {'cell': id, 'error': cellError, 'oldVal': oldVal, 'val': val};
            history.push(historyEntry);
            // log(history);

            if (typeof opts.boardUpdatedFn === "function") {
                opts.boardUpdatedFn({cause: "user input", cellsUpdated: [id]});
            }

            onlyUpdatedCandidates = false;
        };


        /* toggleShowCandidates
         * -----------------------------------------------------------------*/
        var toggleShowCandidates = function() {
            $board.toggleClass("showCandidates");
            candidatesShowing = !candidatesShowing;
        };

         /* analyzeBoard
          * solves a copy of the current board(without updating the UI),
          * reports back: error|finished, usedStrategies and difficulty level and score
          * -----------------------------------------------------------------*/
         var analyzeBoard = function() {
            gradingMode = true;
            solveMode = SOLVE_MODE_ALL;
            let usedStrategiesClone = JSON.parse(JSON.stringify(usedStrategies));
            let boardClone = JSON.parse(JSON.stringify(board));
            let canContinue = true;

            visualEliminationOfCandidates();
            while (canContinue) {
                let startStrat = onlyUpdatedCandidates ? 2 : 0;
                canContinue = solveFn(startStrat);
            }

            let data = {};
            if (boardError) {
                data.error = "Board incorrect";
            } else {
                data.finished = boardFinished;
                data.usedStrategies = [];
                for (let i=0; i<usedStrategies.length; i++) {
                    let strat = strategies[i];
                    //only return strategies that were actually used
                    if (typeof usedStrategies[i] !== "undefined") {
                        data.usedStrategies[i] = {
                            title: strat.title,
                            freq: usedStrategies[i]
                        };
                    }
                }

                if (boardFinished) {
                    let boardDiff = calcBoardDifficulty(usedStrategies);
                    data.level = boardDiff.level;
                    data.score = boardDiff.score;
                }
            }

            //restore everything to state (before solving)
            resetBoardVariables();
            usedStrategies  = usedStrategiesClone;
            board = boardClone;
            visualEliminationOfCandidates();

            return data;
        };


         var setBoardCellWithRandomCandidate = function(cellIndex, forceUIUpdate) {
            // CHECK still valid
            visualEliminationOfCandidates();
            // DRAW RANDOM CANDIDATE
            // don't draw already invalidated candidates for cell
            let invalids = invalidCandidates && invalidCandidates[cellIndex];
            // TODO: don't use JS filter - not supported enough(?)
            let candidates = board[cellIndex].candidates.filter(function(candidate) {
                if (!candidate || (invalids && contains(invalids, candidate))) {
                    return false;
                } else {
                    return candidate;
                }
            });
            // if cell has 0 candidates - fail to set cell.
            if (candidates.length === 0) {
                return false;
            }
            let randIndex = Math.round ( Math.random() * (candidates.length - 1));
            let randomCandidate = candidates[randIndex];
            // UPDATE BOARD
            setBoardCell(cellIndex, randomCandidate);
            return true;
        };

        var generateBoardAnswerRecursively = function(cellIndex) {
            if ((cellIndex+1) > (boardSize*boardSize)) {
                //done
                invalidCandidates = [];
                return true;
            }
            if (setBoardCellWithRandomCandidate(cellIndex)) {
                generateBoardAnswerRecursively(cellIndex + 1);
            } else {
                if (cellIndex <= 0) {
                    return false;
                }
                let lastIndex = cellIndex - 1;
                invalidCandidates[lastIndex] = invalidCandidates[lastIndex] || [];
                invalidCandidates[lastIndex].push(board[lastIndex].val);
                // set val back to null
                setBoardCell(lastIndex, null);
                // reset candidates, only in model.
                resetCandidates(false);
                // reset invalid candidates for cellIndex
                invalidCandidates[cellIndex] = [];
                // then try again
                generateBoardAnswerRecursively(lastIndex);
                return false;
            }
        };

        var easyEnough = function(data) {
            // log(data.level);
            if (data.level === DIFFICULTY_EASY) {
                return true;
            } else if (data.level === DIFFICULTY_MEDIUM) {
                return difficulty !== DIFFICULTY_EASY;
            } else if (data.level === DIFFICULTY_HARD) {
                return difficulty !== DIFFICULTY_EASY && difficulty !== DIFFICULTY_MEDIUM;
            } else if (data.level === DIFFICULTY_VERY_HARD) {
                return difficulty !== DIFFICULTY_EASY && difficulty !== DIFFICULTY_MEDIUM && difficulty !== DIFFICULTY_HARD;
            }
        };
        var hardEnough = function(data) {
            if (difficulty === DIFFICULTY_EASY) {
                return true;
            } else if (difficulty === DIFFICULTY_MEDIUM) {
                return data.level !== DIFFICULTY_EASY;
            } else if (difficulty === DIFFICULTY_HARD) {
                return data.level !== DIFFICULTY_EASY && data.level !== DIFFICULTY_MEDIUM;
            } else if (difficulty === DIFFICULTY_VERY_HARD) {
                return data.level !== DIFFICULTY_EASY && data.level !== DIFFICULTY_MEDIUM && data.level !== DIFFICULTY_HARD;
            }
        };

        var digCells = function() {
            let cells = [];
            let given = boardSize*boardSize;
            let minGiven = 17;
            if (boardSize < 9) {
                minGiven = 4
            } else if (difficulty === DIFFICULTY_EASY) {
                minGiven = 40;
            } else if (difficulty === DIFFICULTY_MEDIUM) {
                minGiven = 30;
            }
            for (let i=0; i < boardSize*boardSize; i++) {
                cells.push(i);
            }

            while (cells.length > 0 && given > minGiven) {
                let randIndex = Math.round ( Math.random() * (cells.length - 1));
                let cellIndex = cells.splice(randIndex,1);
                let val = board[cellIndex].val;

                // remove value from this cell
                setBoardCell(cellIndex, null);
                // reset candidates, only in model.
                resetCandidates(false);

                let data = analyzeBoard();
                if (data.finished !== false && easyEnough(data)) {
                    given--;
                } else {
                    // reset - don't dig this cell
                    setBoardCell(cellIndex, val);
                }

            }
        };

        // generates board puzzle, i.e. the answers for this round
        // requires that a board for boardSize has already been initiated
        var generateBoard = function(diff, callback) {
            if ($boardInputs) {
                clearBoard();
            }
            if (contains(DIFFICULTIES, diff)) {
                difficulty = diff
            } else if (boardSize >= 9) {
                difficulty = DIFFICULTY_MEDIUM
            } else {
                difficulty = DIFFICULTY_EASY
            }
            generatingMode = true;
            solveMode = SOLVE_MODE_ALL;

            // the board generated will possibly not be hard enough
            // (if you asked for "hard", you most likely get "medium")
            generateBoardAnswerRecursively(0);

            // attempt one - save the answer, and try digging multiple times.
            let boardAnswer = board.slice();

            let boardTooEasy = true;

            // log(board);
            while (boardTooEasy) {
                digCells();
                let data = analyzeBoard();
                if (hardEnough(data)) {
                    boardTooEasy = false;
                } else {
                    board = boardAnswer;
                }
            }
            visualEliminationOfCandidates();

            // save a copy of the original board
            for (let j=0; j < boardSize*boardSize ; j++) {
                originalBoard[j] = {
                    val: board[j].val,
                    candidates: board[j].candidates.slice(),
                    title: board[j].title
                };
            }
            // log(originalBoard);
            solveMode = SOLVE_MODE_STEP;
            if ($boardInputs) {
                updateUIBoard(true);
            }

            if (typeof callback === 'function') {
                callback();
            }
        };

        /*
         * init/API/events
         *-----------*/
        if (!opts.board) {
            initBoard(opts);
            generateBoard(opts);
            renderBoard();
        } else {
            board = opts.board;
            initBoard();
            renderBoard();
            visualEliminationOfCandidates();
        }

        $boardInputs.on("click", function(e) {
            let $inputs = $('#sudoku').find('input').not(':disabled');
            let $thisInput = $inputs.eq($inputs.index(this));
            if ($thisInput.val()) {
                $(this).select();
            }
        });

        $boardInputs.on("keyup", function(e) {
            let $this = $(this);
            let id = parseInt($this.attr("id").replace("input-",""));
            //allow keyboard movements - treat backspace and delete as ''
            if (e.keyCode != 8 && e.keyCode != 46 && e.keyCode < 48) {
                // log('keycode: '+e.keyCode);
                keyboardMoveBoardFocus(id, e.keyCode);
            } else {
                let $inputs = $('#sudoku').find('input').not(':disabled');
                let $thisInput = $inputs.eq($inputs.index(this));
                if ($thisInput.val() < 1 || $thisInput.val() > 9) {
                    $thisInput.val('');
                }
                // $boardInputs.removeClass("board-cell-error");
                keyboardNumberInput($thisInput, id);
                updateUIBoard(true);
                // check if finished and valid puzzle solution
                let done = true;
                for (let i = 0; i < $inputs.length; i++) {
                    if ($inputs[i].value == '') {
                        done = false;
                        break;
                    }
                }
                if (done && isBoardFinished()) {
                    if (isBoardValid()) {
                        $('#winner').show();
                        setTimeout("$('#winner').fadeOut(2000);", 3000);
                    } else {
                        alert('Board is not correct!');
                    }
                }
            }
        });


        /**
        * PUBLIC methods
        * ----------------- */
        var solveAll = function() {
            solveMode = SOLVE_MODE_ALL;
            let canContinue = true;
            let boardClone = JSON.parse(JSON.stringify(board));

            visualEliminationOfCandidates();
            while (canContinue) {
                let startStrat = onlyUpdatedCandidates ? 2 : 0;
                canContinue = solveFn(startStrat);
            }
            if (! boardFinished) {
                alert('Board cannot be solved!');
                //restore everything to state (before solving)
                // resetBoardVariables();
                board = boardClone;
                visualEliminationOfCandidates();
                updateUIBoard(true);
            }
        };

        var solveStep = function() {
            solveMode = SOLVE_MODE_STEP;
            let startStrat = onlyUpdatedCandidates ? 2 : 0;

            visualEliminationOfCandidates();
            if (! boardFinished && ! solveFn(startStrat)) {
                alert('Board cannot be solved!');
            }
        };

        var getBoard = function() {
            return board;
        };

        var getOriginalBoard = function() {
            return originalBoard;
        };

        var hideCandidates = function() {
            $board.removeClass("showCandidates");
            candidatesShowing = false;
        };

        var showCandidates = function() {
            $board.addClass("showCandidates");
            candidatesShowing = true;
        };

        var setEditingCandidates = function(newVal) {
            editingCandidates = newVal;
        };

        return {
            solveAll : solveAll,
            solveStep : solveStep,
            analyzeBoard : analyzeBoard,
            resetBoard : resetBoard,
            clearBoard : clearBoard,
            setBoard : setBoard,
            undo : undo,
            getBoard : getBoard,
            getOriginalBoard : getOriginalBoard,
            hideCandidates : hideCandidates,
            showCandidates : showCandidates,
            setEditingCandidates: setEditingCandidates,
            generateBoard : generateBoard
        };
    };

})(window, jQuery);
