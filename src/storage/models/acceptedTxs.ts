import { SQLDataTypes } from '../utils/schemaDefintions';
const acceptedTx = [
    'acceptedTxs',
    {
        txId: { type: SQLDataTypes.STRING, allowNull: false, primaryKey: true },
        timestamp: { type: SQLDataTypes.BIGINT, allowNull: false },
        data: { type: SQLDataTypes.JSON, allowNull: false },
        keys: { type: SQLDataTypes.JSON, allowNull: false },
    },
];
export default acceptedTx;