exports.marker = () => '__MARKER__'

exports.total = values => values.reduce((sum, value) => sum + value, 0)
