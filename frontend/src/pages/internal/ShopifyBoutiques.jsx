import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, Typography, Button, Box, CircularProgress, Alert, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Paper, Chip } from '@mui/material';
import { Refresh, Add } from '@mui/icons-material';
import axios from 'axios';

const ShopifyBoutiques = () => {
  const [shops, setShops] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const navigate = useNavigate();

  const fetchShops = async () => {
    try {
      setLoading(true);
      const response = await axios.get('/api/shopify/shops');
      setShops(response.data.shops || []);
      setError(null);
    } catch (err) {
      console.error('Error fetching Shopify shops:', err);
      setError('Erreur lors du chargement des boutiques Shopify');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchShops();
  }, []);

  const getStatusColor = (status) => {
    switch (status?.toLowerCase()) {
      case 'actif':
        return 'success';
      case 'en attente':
        return 'warning';
      case 'erreur':
        return 'error';
      default:
        return 'default';
    }
  };

  return (
    <Box sx={{ p: 3 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography variant="h4" component="h1">
          Gestion des boutiques Shopify
        </Typography>
        <Box>
          <Button
            variant="contained"
            color="primary"
            startIcon={<Refresh />}
            onClick={fetchShops}
            sx={{ mr: 2 }}
          >
            Actualiser
          </Button>
          <Button
            variant="contained"
            color="primary"
            startIcon={<Add />}
            onClick={() => navigate('/internal/boutiques/nouvelle')}
          >
            Nouvelle boutique
          </Button>
        </Box>
      </Box>

      {error && (
        <Alert severity="error" sx={{ mb: 3 }}>
          {error}
        </Alert>
      )}

      {loading ? (
        <Box display="flex" justifyContent="center" p={4}>
          <CircularProgress />
        </Box>
      ) : (
        <Card>
          <CardContent>
            <TableContainer component={Paper}>
              <Table>
                <TableHead>
                  <TableRow>
                    <TableCell>Boutique</TableCell>
                    <TableCell>Client</TableCell>
                    <TableCell>Type d'abonnement</TableCell>
                    <TableCell>Statut</TableCell>
                    <TableCell>Actions</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {shops.length > 0 ? (
                    shops.map((shop) => (
                      <TableRow key={shop.shopId}>
                        <TableCell>{shop.shopName}</TableCell>
                        <TableCell>{shop.clientName}</TableCell>
                        <TableCell>{shop.typeAbonnement}</TableCell>
                        <TableCell>
                          <Chip
                            label={shop.status}
                            color={getStatusColor(shop.status)}
                            size="small"
                          />
                        </TableCell>
                        <TableCell>
                          <Button
                            variant="outlined"
                            size="small"
                            onClick={() => navigate(`/internal/boutiques/${shop.shopId}`)}
                          >
                            Voir
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell colSpan={5} align="center">
                        Aucune boutique Shopify trouvée
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </TableContainer>
          </CardContent>
        </Card>
      )}
    </Box>
  );
};

export default ShopifyBoutiques;
