import { SQLDataTypes } from '../utils/schemaDefintions';
const accountStates = [
    'accountStates',
    {
        accountId: { type: SQLDataTypes.STRING, allowNull: false, unique: 'compositeIndex' },
        txId: { type: SQLDataTypes.STRING, allowNull: false },
        txTimestamp: { type: SQLDataTypes.BIGINT, allowNull: false, unique: 'compositeIndex' },
        stateBefore: { type: SQLDataTypes.STRING, allowNull: false },
        stateAfter: { type: SQLDataTypes.STRING, allowNull: false },
    },
];
export default accountStates;