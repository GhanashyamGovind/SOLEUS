const errorHandler = (err, req, res, next) => {
    console.error(`${req.path.startsWith('/admin') ? 'Admin' : 'User'} error:`, err.stack);
    const statusCode = err.statusCode || 500;
    const isAdmin = req.path.startsWith('/admin');
    const errorMessage = err.message || (isAdmin ? 'Admin error occurred' : 'User error occurred');

    if (req.xhr || req.is('json')) {
        return res.status(statusCode).json({
            error: true,
            message: errorMessage,
        });
    }

    res.status(statusCode).render(isAdmin ? 'admin/page-404' : 'user/page-404', {
        message: errorMessage,
        statusCode,
    });
};

module.exports = errorHandler;