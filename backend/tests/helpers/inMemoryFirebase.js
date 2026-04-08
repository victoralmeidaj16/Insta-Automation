function getValueByPath(source, path) {
    return path.split('.').reduce((value, key) => value?.[key], source);
}

function clone(value) {
    return structuredClone(value);
}

function compareValues(left, right) {
    const leftValue = left instanceof Date ? left.getTime() : left;
    const rightValue = right instanceof Date ? right.getTime() : right;

    if (leftValue === rightValue) return 0;
    return leftValue > rightValue ? 1 : -1;
}

function createDocSnapshot(id, data) {
    return {
        id,
        exists: data !== undefined,
        data: () => (data === undefined ? undefined : clone(data)),
    };
}

function createQuerySnapshot(entries) {
    const docs = entries.map(([id, data]) => createDocSnapshot(id, data));
    return {
        empty: docs.length === 0,
        docs,
        forEach(callback) {
            docs.forEach(callback);
        }
    };
}

export function createInMemoryFirebase() {
    let idCounter = 1;
    const collections = new Map();
    const deletedFiles = [];

    function ensureCollection(name) {
        if (!collections.has(name)) {
            collections.set(name, new Map());
        }

        return collections.get(name);
    }

    function buildQuery(name, filters = [], orderRule = null, limitSize = null) {
        return {
            where(field, operator, value) {
                return buildQuery(name, [...filters, { field, operator, value }], orderRule, limitSize);
            },
            orderBy(field, direction = 'asc') {
                return buildQuery(name, filters, { field, direction }, limitSize);
            },
            limit(value) {
                return buildQuery(name, filters, orderRule, value);
            },
            async get() {
                let entries = Array.from(ensureCollection(name).entries());

                entries = entries.filter(([, data]) => {
                    return filters.every(({ field, operator, value }) => {
                        const fieldValue = getValueByPath(data, field);

                        if (operator === '==') return fieldValue === value;
                        if (operator === '<=') return compareValues(fieldValue, value) <= 0;
                        if (operator === '>=') return compareValues(fieldValue, value) >= 0;

                        throw new Error(`Unsupported operator in test DB: ${operator}`);
                    });
                });

                if (orderRule) {
                    entries.sort((a, b) => {
                        const left = getValueByPath(a[1], orderRule.field);
                        const right = getValueByPath(b[1], orderRule.field);
                        const result = compareValues(left, right);
                        return orderRule.direction === 'desc' ? -result : result;
                    });
                }

                if (typeof limitSize === 'number') {
                    entries = entries.slice(0, limitSize);
                }

                return createQuerySnapshot(entries);
            }
        };
    }

    const db = {
        collection(name) {
            const collection = ensureCollection(name);

            return {
                async add(data) {
                    const id = `${name}-${idCounter++}`;
                    collection.set(id, clone(data));
                    return { id };
                },
                doc(id) {
                    return {
                        async get() {
                            return createDocSnapshot(id, collection.get(id));
                        },
                        async update(updates) {
                            const current = collection.get(id);
                            if (!current) {
                                throw new Error(`Document not found in test DB: ${name}/${id}`);
                            }

                            collection.set(id, {
                                ...current,
                                ...clone(updates),
                            });
                        },
                        async delete() {
                            collection.delete(id);
                        }
                    };
                },
                where(field, operator, value) {
                    return buildQuery(name).where(field, operator, value);
                },
                orderBy(field, direction = 'asc') {
                    return buildQuery(name).orderBy(field, direction);
                },
                limit(value) {
                    return buildQuery(name).limit(value);
                },
                async get() {
                    return buildQuery(name).get();
                }
            };
        }
    };

    const storage = {
        file(path) {
            return {
                async delete() {
                    deletedFiles.push(path);
                }
            };
        }
    };

    return {
        db,
        storage,
        deletedFiles,
        reset() {
            collections.clear();
            deletedFiles.length = 0;
            idCounter = 1;
        },
        getCollection(name) {
            return ensureCollection(name);
        }
    };
}
