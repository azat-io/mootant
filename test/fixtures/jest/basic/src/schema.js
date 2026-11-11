const FIELDS = ['id']

if (FIELDS.length !== 1) {
  throw new Error('Unexpected fields')
}

module.exports = FIELDS
