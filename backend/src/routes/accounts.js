import express from 'express';
import {
    addAccount,
    getAccounts,
    updateAccount,
    deleteAccount,
    verifyAccount,
} from '../services/accountService.js';

const router = express.Router();

/**
 * POST /api/accounts - Adicionar nova conta
 */
router.post('/', async (req, res) => {
    try {
        const { username, email, password, stayLoggedIn } = req.body;

        if (!username || !email || !password) {
            return res.status(400).json({
                error: 'Username, email e password são obrigatórios',
            });
        }

        const account = await addAccount(
            req.userId,
            username,
            email,
            password,
            stayLoggedIn ?? true
        );

        res.status(201).json({
            message: 'Conta adicionada com sucesso',
            account,
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

        await updateAccount(id, updates);

        res.json({
            message: 'Conta atualizada com sucesso',
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * DELETE /api/accounts/:id - Remover conta
 */
router.delete('/:id', async (req, res) => {
    try {
        const { id } = req.params;

        await deleteAccount(id);

        res.json({
            message: 'Conta removida com sucesso',
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * POST /api/accounts/:id/verify - Verificar login da conta
 */
router.post('/:id/verify', async (req, res) => {
    try {
        const { id } = req.params;

        const result = await verifyAccount(id);

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
        res.status(500).json({ error: error.message });
    }
});

export default router;
