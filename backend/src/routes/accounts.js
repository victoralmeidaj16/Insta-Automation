import express from 'express';
import {
    addAccount,
    getAccounts,
    updateAccount,
    deleteAccount,
    verifyAccount,
} from '../services/accountService.js';

function sendAccountError(error, res) {
    const status = error.statusCode || 500;
    return res.status(status).json({ error: status === 500 ? 'Erro interno do servidor.' : error.message });
}

const router = express.Router();

/**
 * POST /api/accounts - Adicionar nova conta
 */
router.post('/', async (req, res) => {
    try {
        const { username, email, password, stayLoggedIn, businessProfileId } = req.body;

        if (!username || !password) {
            return res.status(400).json({
                error: 'Username e password são obrigatórios',
            });
        }

        const account = await addAccount(
            req.userId,
            username,
            email,
            password,
            stayLoggedIn ?? true,
            businessProfileId
        );

        res.status(201).json({
            message: 'Conta adicionada com sucesso',
            account: {
                id: account.id,
                userId: account.userId,
                username: account.username,
                status: account.status,
                businessProfileId: account.businessProfileId,
                hasEmail: Boolean(email),
                hasPassword: true,
            },
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * GET /api/accounts - Listar contas do usuário
 */
router.get('/', async (req, res) => {
    try {
        const accounts = await getAccounts(req.userId);

        res.json({
            accounts,
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * PUT /api/accounts/:id - Atualizar conta
 */
router.put('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const updates = req.body;

        await updateAccount(id, updates, req.userId);

        res.json({
            message: 'Conta atualizada com sucesso',
        });
    } catch (error) {
        console.error(error);
        sendAccountError(error, res);
    }
});

/**
 * DELETE /api/accounts/:id - Remover conta
 */
router.delete('/:id', async (req, res) => {
    try {
        const { id } = req.params;

        await deleteAccount(id, req.userId);

        res.json({
            message: 'Conta removida com sucesso',
        });
    } catch (error) {
        console.error(error);
        sendAccountError(error, res);
    }
});

/**
 * POST /api/accounts/:id/verify - Verificar login da conta
 */
router.post('/:id/verify', async (req, res) => {
    try {
        const { id } = req.params;

        const result = await verifyAccount(id, req.userId);

        if (result.success) {
            res.json({
                message: 'Login verificado com sucesso',
                result,
            });
        } else {
            res.status(400).json({
                error: result.message,
                result,
            });
        }
    } catch (error) {
        console.error(error);
        sendAccountError(error, res);
    }
});

export default router;
