import { app } from 'electron';
import path from 'node:path';
import Database from 'better-sqlite3';

class AppDatabase {
    constructor() {
        this.id = 1;
        // TODO: You'd have to make it so only this app's main process can write to the db otherwise remote code execution possibilities?
        const dbPath = path.join(app.getPath('userData'), 'to-do.sqlite');
        this.db = new Database(dbPath);
        this.db.pragma('journal_mode = WAL');
        this.setUpDataBase();
    }

    /**
     * - TODO: displayName or fileName
     * - TODO: should displayName/fileName even be stored? If the intention is to store the fileName, you can calculate this but then again if you calculate this it adds a lot of GC overhead as you scroll up and down the TreeView very quickly maybe but then again maybe moving the data from server to UI of this value is also expensive GC equal or less or more?
     * 
     * - TODO "do it in one query" (google AI overview was a search for something else I can't remember, the quoted text is just the a quick explanation of this what this topic is)
     *     - The "Dummy Update" Trick (row bloat in some dbs)
     *     - Common Table Expression (CTE)
     * 
     * - TODO: Is the 'result' pooled?
     * 
     * - TODO: "continue with check query, insert query, get query; but just do it in bulk for many paths?"
     * - TODO: "try to get the entry, if it exists return the id, else insert query but the autoincrement comes from the main process to avoid a get query since I don't know how to get the autoincremented id from the same query?"
     * 
     * - TODO: Add 'isDirectory' to the table?
     * - TODO: Create a directory with some absolute path, delete that directory, then create a file with the same absolute path.
     * - TODO: Create a file with some absolute path, delete that file, then create a directory with the same absolute path.
     * */
    setUpDataBase() {
        this.db.exec(`
            DROP TABLE IF EXISTS AbsolutePaths;

            CREATE TABLE IF NOT EXISTS AbsolutePaths (
                id INTEGER PRIMARY KEY,
                value TEXT UNIQUE NOT NULL,
                displayName TEXT NOT NULL
            )
            `);
        console.log('db initialized!');
    }

    /**
     * If a row with the unique absolutePath already exists: the already existing row remains unchanged.
     * 
     * (this includes when the displayName provided to this function differs from the one in the row: the already existing row remains unchanged)
     * 
     * @param {string} absolutePath 
     * @param {string} displayName 
     * @returns the id in the exiting row, or the one that was added if there was no already existing row; info.changes <= 0 returns '-1'.
     */
    addAbsolutePath(absolutePath, displayName) {
        let existingRow = this.getBy_absolutePath(absolutePath);
        if (existingRow) {
            return existingRow.id;
        }
        const info = this.db
            .prepare('INSERT INTO AbsolutePaths (id, value, displayName) VALUES (?, ?, ?) ON CONFLICT(id) DO NOTHING ON CONFLICT(value) DO NOTHING')
            .run(this.id, absolutePath, displayName);
        return info.changes > 0
            ? this.id++
            : -1; // JavaScript numbers do not wrap around to negative values, they approach infinity; thus this is fine.
    }

    /**
     * @param {string} absolutePath 
     * @returns boolean of the result's falsey
     */
    contains(absolutePath) {
        const result = this.db
            .prepare('SELECT * from AbsolutePaths WHERE value = ?')
            .get(absolutePath);
        if (result) {
            return true;
        }
        else {
            return false;
        }
    }

    /**
     * @param {string} absolutePath 
     * @returns the first row from the query result, or undefined.
     */
    getBy_absolutePath(absolutePath) {
        return this.db
            .prepare('SELECT * from AbsolutePaths WHERE value = ?')
            .get(absolutePath);
    }
    
    /**
     * @param {number} id 
     * @returns the first row from the query result, or undefined.
     */
    getBy_id(id) {
        return this.db
            .prepare('SELECT * from AbsolutePaths WHERE id = ?')
            .get(id);
    }
}

export default AppDatabase;
